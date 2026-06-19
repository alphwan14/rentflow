import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SmsWorkerService } from "./sms-worker.service";
import { SmsRepository } from "./sms.repository";

/**
 * Extract the admin token from the request. Accepts either:
 *   - Authorization: Bearer <token>   (scheme is case-insensitive)
 *   - X-Worker-Token: <token>         (fallback)
 */
function extractToken(authHeader?: string, workerTokenHeader?: string): string | undefined {
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match) return match[1].trim();
  }
  if (workerTokenHeader && workerTokenHeader.trim() !== "") {
    return workerTokenHeader.trim();
  }
  return undefined;
}

/** Map an Africa's Talking delivery status to our terminal states (or null = intermediate). */
function mapDeliveryStatus(atStatus: string): "delivered" | "failed" | null {
  switch (atStatus?.toLowerCase()) {
    case "delivered":
      return "delivered";
    case "failed":
    case "rejected":
      return "failed";
    default:
      // Sent / Submitted / Buffered / Success — not terminal; leave row as-is.
      return null;
  }
}

@Controller("sms")
export class SmsController {
  private readonly logger = new Logger("SmsController");

  constructor(
    private readonly worker: SmsWorkerService,
    private readonly repo: SmsRepository,
    private readonly config: AppConfigService
  ) {}

  /** Manual one-cycle trigger (ops/testing). Protected by WORKER_ADMIN_TOKEN. */
  @Post("process")
  @HttpCode(200)
  async process(
    @Headers("authorization") authHeader?: string,
    @Headers("x-worker-token") workerTokenHeader?: string
  ) {
    if (this.config.adminToken) {
      const provided = extractToken(authHeader, workerTokenHeader);
      if (provided !== this.config.adminToken) {
        throw new ForbiddenException("Invalid worker token");
      }
    }
    return this.worker.tick();
  }

  /**
   * Africa's Talking delivery-report callback. AT POSTs form-encoded fields:
   *   id (messageId), status, phoneNumber, networkCode, failureReason, retryCount
   * We update the matching sms_messages row to its real delivery state.
   *
   * Always returns 200 so AT doesn't retry; unknown ids are logged, not errored.
   * Optionally protected by DELIVERY_REPORT_TOKEN via ?token= (configure the same
   * value in the AT callback URL).
   */
  @Post("delivery-report")
  @HttpCode(200)
  async deliveryReport(
    @Body() body: Record<string, string>,
    @Query("token") token?: string
  ) {
    if (this.config.deliveryReportToken && token !== this.config.deliveryReportToken) {
      throw new ForbiddenException("Invalid delivery report token");
    }

    const messageId = body.id ?? body.messageId;
    const atStatus = body.status ?? "";
    const failureReason = body.failureReason || null;

    if (!messageId) {
      this.logger.warn(JSON.stringify({ event: "sms.dlr.missing_id", body }));
      return { ok: true };
    }

    const mapped = mapDeliveryStatus(atStatus);
    this.logger.log(
      JSON.stringify({
        event: "sms.dlr.received",
        messageId,
        atStatus,
        mapped: mapped ?? "intermediate",
        phoneNumber: body.phoneNumber,
      })
    );

    if (!mapped) {
      // Intermediate status (Sent/Submitted/Buffered) — acknowledge, no change.
      return { ok: true, applied: false };
    }

    const updated = await this.repo.applyDeliveryReport(messageId, mapped, failureReason, body);
    if (updated === 0) {
      this.logger.warn(JSON.stringify({ event: "sms.dlr.unknown_id", messageId }));
    }
    return { ok: true, applied: updated > 0 };
  }
}
