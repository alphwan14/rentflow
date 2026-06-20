import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SmsRepository } from "./sms.repository";
import { SMS_PROVIDER, type SmsProvider } from "./providers/sms-provider.interface";
import { isExhausted, nextAttemptAt } from "./retry";
import type { SmsRow } from "./sms.types";

/**
 * Background SMS worker. On each tick it reaps crash-stranded rows, claims a
 * batch of due messages (atomically), and sends them — settling each as sent,
 * retrying (with backoff) or failed.
 *
 * Reliability properties:
 *  - Overlap guard: a slow tick never runs concurrently with the next one.
 *  - Graceful shutdown: stops claiming new work and lets in-flight sends finish.
 *  - The worker only ever touches sms_messages — financial state is untouchable.
 */
@Injectable()
export class SmsWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SmsWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private shuttingDown = false;

  constructor(
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    private readonly repo: SmsRepository,
    private readonly config: AppConfigService
  ) {}

  onModuleInit(): void {
    const { intervalMs } = this.config.worker;
    this.logger.log(
      `SMS worker started — provider=${this.provider.name}, interval=${intervalMs}ms, batch=${this.config.worker.batchSize}`
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Don't keep the event loop alive solely for the timer.
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One processing cycle. Safe to call manually (e.g. an admin trigger). */
  async tick(): Promise<{ processed: number; sent: number; retried: number; failed: number }> {
    if (this.running || this.shuttingDown) {
      return { processed: 0, sent: 0, retried: 0, failed: 0 };
    }
    this.running = true;
    const stats = { processed: 0, sent: 0, retried: 0, failed: 0 };
    try {
      const reaped = await this.repo.reapStuck();

      const batch = await this.repo.claimBatch(this.config.worker.batchSize);
      // Liveness + claim visibility. A steady stream of claimed=0 while rows sit
      // pending means the worker is hitting the wrong DB or the claim RPC is
      // failing — the single most useful production signal for queue stalls.
      this.logger.log(
        JSON.stringify({ event: "sms.worker.tick", reaped, claimed: batch.length })
      );
      for (const row of batch) {
        if (this.shuttingDown) break;
        const outcome = await this.process(row);
        stats.processed += 1;
        stats[outcome] += 1;
      }
      if (stats.processed > 0) {
        this.logger.log(
          `tick: ${stats.sent} sent, ${stats.retried} retrying, ${stats.failed} failed`
        );
      }
    } catch (err) {
      this.logger.error(`tick error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
    return stats;
  }

  private async process(row: SmsRow): Promise<"sent" | "retried" | "failed"> {
    // End-to-end trace: correlate every stage by the sms_messages row id.
    this.logger.log(
      JSON.stringify({ event: "sms.process.start", smsId: row.id, to: row.to_phone, attempt: row.attempts + 1 })
    );
    const result = await this.provider.send(row.to_phone, row.body);
    const attempts = row.attempts + 1;

    if (result.success) {
      this.logger.log(
        JSON.stringify({
          event: "sms.process.sent",
          smsId: row.id,
          providerMessageId: result.providerMessageId ?? null,
        })
      );
      await this.repo.markSent(row.id, this.provider.name, attempts, result.providerMessageId, result.raw);
      return "sent";
    }

    if (isExhausted(attempts, row.max_attempts)) {
      await this.repo.markFailed(row.id, this.provider.name, attempts, result.errorMessage, result.raw);
      this.logger.warn(`SMS ${row.id} failed permanently after ${attempts} attempts`);
      return "failed";
    }

    await this.repo.markRetry(
      row.id,
      this.provider.name,
      attempts,
      nextAttemptAt(attempts, new Date()),
      result.errorMessage,
      result.raw
    );
    return "retried";
  }
}
