import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import {
  tokensMatch,
  ipAllowed,
  clientIp,
  describeToken,
  candidateForms,
  diagnoseMismatch,
} from "./callback-auth";

/** Minimal structural request type (avoids coupling to Express typings). */
interface IncomingRequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  /** Express: full path+query as received. Contains the secret — NEVER log raw. */
  originalUrl?: string;
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

  /**
   * TEMPORARY diagnostic endpoint for the delivery-report auth investigation.
   * Exposes only non-reversible token fingerprints (length + sha256 prefix +
   * charset flags) — never the token. Compare `tokenSha12` against the value
   * logged at startup and against your local env to verify Render holds the
   * expected DELIVERY_REPORT_TOKEN. Remove once delivery reports flow.
   */
  @Get("webhook-diagnostics")
  webhookDiagnostics() {
    const expected = this.config.deliveryReportToken;
    const d = describeToken(expected);
    return {
      mode: "path token authentication (header and ?token= also accepted)",
      expectedCallbackFormat:
        "https://<backend>.onrender.com/sms/delivery-report/<DELIVERY_REPORT_TOKEN>",
      tokenConfigured: d.exists,
      tokenLength: d.length,
      tokenSha12: d.sha12,
      tokenUrlSafe: d.exists && !d.containsPlus && !d.containsSlash && !d.containsEquals,
      ipAllowlist: this.config.deliveryReportAllowedIps.length || "disabled",
    };
  }

  /**
   * TEMPORARY auth isolation probe: exercises the EXACT same authentication
   * path as the delivery-report webhook (same param extraction, same
   * candidateForms normalization, same constant-time tokensMatch) without
   * involving Africa's Talking at all. Open in a browser:
   *   GET /sms/webhook-test/<token>
   * Returns fingerprints only — never token values. Remove after the
   * investigation closes. (Not an oracle risk: the token has >120 bits of
   * entropy and comparison is constant-time.)
   */
  @Get("webhook-test/:token")
  webhookTest(@Param("token") pathToken: string) {
    const expected = this.config.deliveryReportToken;
    if (!expected) {
      return { authenticated: false, reason: "env_token_missing" };
    }
    const hit = candidateForms(pathToken).find((f) => tokensMatch(f.value, expected));
    return {
      authenticated: !!hit,
      matchedForm: hit?.form ?? null,
      reason: hit ? null : diagnoseMismatch(pathToken, expected),
      supplied: describeToken(pathToken),
      expected: describeToken(expected),
    };
  }

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
    // ?token= query. Each channel is additionally tried in semantically-equal
    // normalized forms (trimmed / url-decoded / trailing-slash-stripped) so a
    // transport-mangled but CORRECT token still authenticates — and the log
    // says which normalization was needed. All comparisons are constant-time;
    // token values are never logged (hash prefixes + shape flags only).
    if (this.config.deliveryReportToken) {
      const expected = this.config.deliveryReportToken;
      const channels: Array<{ via: string; raw?: string }> = [
        { via: "path", raw: pathToken },
        { via: "header", raw: headerToken },
        { via: "query", raw: queryToken },
      ];
      const supplied = channels.filter((c) => c.raw && c.raw.length > 0);

      // Fingerprints of BOTH sides immediately before comparison (never the
      // values): identical sha12s here that still fail would indicate a
      // comparison bug; differing sha12s identify which side holds what.
      const expectedDesc = describeToken(expected);
      const suppliedDesc = describeToken(supplied[0]?.raw);
      this.logger.log(
        JSON.stringify({
          event: "sms.dlr.auth_check",
          suppliedVia: supplied.map((c) => c.via),
          suppliedLength: suppliedDesc.length,
          expectedLength: expectedDesc.length,
          suppliedSha12: suppliedDesc.sha12,
          expectedSha12: expectedDesc.sha12,
        })
      );

      let matched: { via: string; form: string } | null = null;
      for (const c of supplied) {
        const hit = candidateForms(c.raw!).find((f) => tokensMatch(f.value, expected));
        if (hit) {
          matched = { via: c.via, form: hit.form };
          break;
        }
      }

      if (!matched) {
        const first = supplied[0]?.raw;
        // Detect the classic env-var swap: WORKER_ADMIN_TOKEN pasted into the
        // AT dashboard instead of DELIVERY_REPORT_TOKEN (both look alike).
        const isAdminToken =
          !!first && !!this.config.adminToken && tokensMatch(first.trim(), this.config.adminToken);
        this.logger.warn(
          JSON.stringify({
            event: "sms.dlr.auth_failed",
            ip,
            reason: isAdminToken
              ? "worker_admin_token_pasted_in_callback_url"
              : diagnoseMismatch(first, expected),
            suppliedVia: supplied.map((c) => c.via),
            expected: describeToken(expected),
            received: describeToken(first),
            route: {
              matched: pathToken ? "delivery-report/:token" : "delivery-report",
              originalUrlLength: req.originalUrl?.length ?? null,
              endsWithSlash: req.originalUrl?.split("?")[0].endsWith("/") ?? null,
              pathTokenLength: pathToken?.length ?? null,
            },
          })
        );
        throw new ForbiddenException("Invalid delivery report token");
      }
      this.logger.log(
        JSON.stringify({ event: "sms.dlr.auth_ok", via: matched.via, form: matched.form, ip })
      );
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
