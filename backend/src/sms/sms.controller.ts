import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SmsWorkerService } from "./sms-worker.service";
import { SmsRepository } from "./sms.repository";
import { tokensMatch, ipAllowed, clientIp } from "./callback-auth";

/** Minimal structural request type (avoids coupling to Express typings). */
interface IncomingRequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

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
      if (!tokensMatch(provided, this.config.adminToken)) {
        throw new ForbiddenException("Invalid worker token");
      }
    }
    return this.worker.tick();
  }

  /**
   * Africa's Talking delivery-report callback. AT POSTs form-encoded fields:
   *   id (messageId), status, phoneNumber, networkCode, failureReason, retryCount
   *
   * AUTHENTICATION (AT does not sign callbacks and cannot send headers, so):
   *   1. Shared secret compared in constant time, accepted from the URL path
   *      (preferred — register the callback as
   *        https://<backend>/sms/delivery-report/<DELIVERY_REPORT_TOKEN>),
   *      the X-Delivery-Token header, or ?token= query. AT is configured with
   *      a bare URL only, so both URL shapes must authenticate — a dashboard
   *      URL in either form can never silently break delivery reports.
   *   2. Optional source-IP allowlist (DELIVERY_REPORT_ALLOWED_IPS) — enable
   *      once Africa's Talking support confirms their egress ranges.
   *   3. Message-id correlation — the repository only applies a report to a
   *      row this system sent and that is awaiting confirmation.
   *
   * Authenticated requests always get 200 (AT must not retry); auth failures
   * get 403 and are logged without the token value.
   */
  @Post(["delivery-report/:token", "delivery-report"])
  @HttpCode(200)
  async deliveryReport(
    @Body() body: Record<string, string>,
    @Req() req: IncomingRequestLike,
    @Param("token") pathToken?: string,
    @Headers("x-delivery-token") headerToken?: string,
    @Query("token") queryToken?: string
  ) {
    const ip = clientIp(req.headers, req.socket?.remoteAddress);

    if (!ipAllowed(ip, this.config.deliveryReportAllowedIps)) {
      this.logger.warn(JSON.stringify({ event: "sms.dlr.ip_rejected", ip }));
      throw new ForbiddenException("Source not allowed");
    }

    // Token may arrive via URL path (preferred), X-Delivery-Token header, or
    // ?token= query. Africa's Talking can only be configured with a bare URL,
    // so BOTH URL forms must authenticate — a dashboard URL in either shape
    // can never silently break delivery reports again. All comparisons are
    // constant-time; token values are never logged.
    if (this.config.deliveryReportToken) {
      const candidates: Array<{ via: string; value?: string }> = [
        { via: "path", value: pathToken?.trim() || undefined },
        { via: "header", value: headerToken?.trim() || undefined },
        { via: "query", value: queryToken?.trim() || undefined },
      ];
      const supplied = candidates.filter((c) => c.value);
      const matched = supplied.find((c) => tokensMatch(c.value, this.config.deliveryReportToken!));

      if (!matched) {
        this.logger.warn(
          JSON.stringify({
            event: "sms.dlr.auth_failed",
            ip,
            reason: supplied.length === 0 ? "no_token_supplied" : "token_mismatch",
            suppliedVia: supplied.map((c) => c.via),
          })
        );
        throw new ForbiddenException("Invalid delivery report token");
      }
      this.logger.log(JSON.stringify({ event: "sms.dlr.auth_ok", via: matched.via, ip }));
    }

    const messageId = body.id ?? body.messageId;
    const atStatus = body.status ?? "";
    const failureReason = body.failureReason || null;

    if (!messageId || typeof messageId !== "string") {
      this.logger.warn(JSON.stringify({ event: "sms.dlr.missing_id" }));
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
        ip,
      })
    );

    if (!mapped) {
      // Intermediate status (Sent/Submitted/Buffered) — acknowledge, no change.
      this.logger.log(JSON.stringify({ event: "sms.dlr.finished", messageId, applied: false, why: "intermediate_status" }));
      return { ok: true, applied: false };
    }

    const updated = await this.repo.applyDeliveryReport(messageId, mapped, failureReason, body);
    this.logger.log(
      JSON.stringify({ event: "sms.dlr.finished", messageId, status: mapped, applied: updated > 0 })
    );
    return { ok: true, applied: updated > 0 };
  }
}
