import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { AppConfigService } from "../config/app-config.service";
import type { SmsRow } from "./sms.types";

/**
 * All sms_messages persistence. The claim uses a SQL function with
 * FOR UPDATE SKIP LOCKED (no two workers grab the same row); settlement updates
 * are plain service-role writes.
 */
@Injectable()
export class SmsRepository {
  private readonly logger = new Logger(SmsRepository.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: AppConfigService
  ) {}

  /** Atomically reserve a batch of due messages (status -> 'sending'). */
  async claimBatch(limit: number): Promise<SmsRow[]> {
    const { data, error } = await this.supabase.client.rpc("claim_sms_batch", {
      p_limit: limit,
    });
    if (error) {
      this.logger.error(`claim_sms_batch failed: ${error.message}`);
      return [];
    }
    return (data ?? []) as SmsRow[];
  }

  /**
   * [SMS DEBUG] Count rows in a claimable status (pending|retrying), ignoring
   * due-time. If this is > 0 while claimBatch keeps returning 0 over several
   * ticks, the claim/visibility is the problem; if it's 0, nothing is due
   * (correct) — the worker simply has no work in THIS database.
   */
  async countOpen(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retrying"]);
    if (error) {
      this.logger.error(`countOpen failed: ${error.message}`);
      return -1;
    }
    return count ?? 0;
  }

  /** Re-queue rows stuck in 'sending' (worker crashed mid-send). */
  async reapStuck(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc("reap_stuck_sms", {
      p_timeout_seconds: this.config.worker.visibilityTimeoutSec,
    });
    if (error) {
      this.logger.error(`reap_stuck_sms failed: ${error.message}`);
      return 0;
    }
    return (data as number) ?? 0;
  }

  async markSent(
    id: string,
    provider: string,
    attempts: number,
    providerMessageId: string | undefined,
    raw: unknown
  ): Promise<void> {
    await this.update(id, {
      status: "sent",
      provider,
      attempts,
      provider_message_id: providerMessageId ?? null,
      provider_response: raw ?? null,
      sent_at: new Date().toISOString(),
      locked_at: null,
      error: null,
    });
  }

  async markRetry(
    id: string,
    provider: string,
    attempts: number,
    nextAttemptAt: Date,
    errorMessage: string | undefined,
    raw: unknown
  ): Promise<void> {
    await this.update(id, {
      status: "retrying",
      provider,
      attempts,
      next_attempt_at: nextAttemptAt.toISOString(),
      provider_response: raw ?? null,
      error: errorMessage ?? null,
      locked_at: null,
    });
  }

  async markFailed(
    id: string,
    provider: string,
    attempts: number,
    errorMessage: string | undefined,
    raw: unknown
  ): Promise<void> {
    await this.update(id, {
      status: "failed",
      provider,
      attempts,
      provider_response: raw ?? null,
      error: errorMessage ?? null,
      locked_at: null,
    });
  }

  /**
   * Apply an Africa's Talking delivery report, matched by provider_message_id.
   * Returns the number of rows updated (0 = unknown messageId or not applicable).
   *
   * SOURCE CORRELATION (webhook auth, layer 3): a report only ever applies to
   * a row in status 'sent' — i.e. a message this system actually handed to the
   * gateway and that is awaiting confirmation. A forged or replayed report can
   * never flip a delivered row to failed, resurrect a failed row, or touch a
   * row that was never sent; it would also need to guess a valid gateway
   * message id. Duplicate reports after settlement are logged as no-ops.
   */
  async applyDeliveryReport(
    providerMessageId: string,
    status: "delivered" | "failed",
    failureReason: string | null,
    raw: Record<string, unknown>
  ): Promise<number> {
    const patch: Record<string, unknown> = {
      status,
      delivery_report: raw,
      error: failureReason,
    };
    if (status === "delivered") patch.delivered_at = new Date().toISOString();

    const { data, error } = await this.supabase.client
      .from("sms_messages")
      .update(patch)
      .eq("provider_message_id", providerMessageId)
      .eq("status", "sent")
      .select("id");

    if (error) {
      this.logger.error(`applyDeliveryReport ${providerMessageId} failed: ${error.message}`);
      return 0;
    }

    const updated = data?.length ?? 0;
    if (updated > 0) {
      this.logger.log(
        JSON.stringify({
          event: "sms.dlr.applied",
          messageId: providerMessageId,
          smsId: data![0].id,
          status,
        })
      );
    }
    if (updated === 0) {
      // Distinguish "unknown id" from "already settled" for the ops trail.
      const { data: existing } = await this.supabase.client
        .from("sms_messages")
        .select("id,status")
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      this.logger.warn(
        JSON.stringify({
          event: existing ? "sms.dlr.ignored_settled" : "sms.dlr.unknown_id",
          messageId: providerMessageId,
          currentStatus: existing?.status ?? null,
        })
      );
    }
    return updated;
  }

  private async update(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client.from("sms_messages").update(patch).eq("id", id);
    if (error) {
      this.logger.error(`update sms_messages ${id} failed: ${error.message}`);
    }
  }
}
