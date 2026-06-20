import { Injectable, Logger } from "@nestjs/common";

export type SmsProviderName = "africastalking" | "console";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Typed, validated configuration.
 *
 * Production posture:
 *  - The SMS provider defaults to Africa's Talking (production). There is NO
 *    silent fallback to a simulator: if AT is selected but not fully configured,
 *    the app FAILS FAST rather than pretending to send.
 *  - The Africa's Talking integration is production-only (the live endpoint).
 *    For local dev that must not send real SMS, set SMS_PROVIDER=console
 *    explicitly — that is the single, intentional dev escape hatch.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly smsProvider: SmsProviderName;
  readonly at: { username: string; apiKey: string; from?: string };
  readonly worker: {
    intervalMs: number;
    batchSize: number;
    maxAttempts: number;
    visibilityTimeoutSec: number;
  };
  readonly port: number;
  readonly adminToken?: string;
  readonly deliveryReportToken?: string;
  /** Allowed CORS origins (frontend domains). Comma-separated CORS_ORIGINS env. */
  readonly corsOrigins: string[];

  constructor() {
    this.supabaseUrl = required("SUPABASE_URL");
    this.supabaseServiceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

    // Default to production AT. Explicit "console" is the only dev escape hatch.
    const provider: SmsProviderName =
      process.env.SMS_PROVIDER?.toLowerCase() === "console" ? "console" : "africastalking";
    this.smsProvider = provider;

    this.at = {
      username: process.env.AT_USERNAME?.trim() || "",
      apiKey: process.env.AT_API_KEY?.trim() || "",
      from: process.env.AT_FROM?.trim() || undefined,
    };

    // Fail fast — never silently simulate in production.
    if (provider === "africastalking") {
      if (!this.at.username) throw new Error("Missing required environment variable: AT_USERNAME");
      if (!this.at.apiKey) throw new Error("Missing required environment variable: AT_API_KEY");
    }

    this.worker = {
      intervalMs: intEnv("SMS_WORKER_INTERVAL_MS", 5000),
      batchSize: intEnv("SMS_WORKER_BATCH_SIZE", 20),
      maxAttempts: intEnv("SMS_MAX_ATTEMPTS", 6),
      visibilityTimeoutSec: intEnv("SMS_VISIBILITY_TIMEOUT_SEC", 120),
    };
    this.port = intEnv("PORT", 3001);
    this.adminToken = process.env.WORKER_ADMIN_TOKEN?.trim() || undefined;
    this.deliveryReportToken = process.env.DELIVERY_REPORT_TOKEN?.trim() || undefined;
    this.corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    // Structured startup diagnostics (no secrets).
    const mode = provider === "africastalking" ? "production" : "console (dev)";
    this.logger.log(
      JSON.stringify({
        event: "config.loaded",
        mode,
        smsProvider: provider,
        atUsername: this.at.username || null,
        senderId: this.at.from ?? null,
        port: this.port,
        corsOrigins: this.corsOrigins,
        workerAdminToken: maskToken(this.adminToken),
        deliveryReportToken: maskToken(this.deliveryReportToken),
      })
    );

    // ---- ENV CHECK: single-source-of-truth audit (NO secrets) --------------
    // Proves which Supabase project this process targets and that its
    // service-role key belongs to that SAME project. Compare the printed
    // supabase_url against the frontend's NEXT_PUBLIC_SUPABASE_URL — and watch
    // for url_key_project_parity=true. This is the production tripwire for a
    // staging/prod mix or an orphan key from an old deployment.
    const urlRef = projectRefFromUrl(this.supabaseUrl);
    const keyClaims = decodeSupabaseKeyClaims(this.supabaseServiceRoleKey);
    const refParity =
      urlRef && keyClaims.ref ? urlRef === keyClaims.ref : null;

    this.logger.log(
      [
        "ENV CHECK:",
        `supabase_url=${this.supabaseUrl}`,
        `supabase_project_ref=${urlRef ?? "UNPARSEABLE"}`,
        `service_key_ref=${keyClaims.ref ?? "UNKNOWN"}`,
        `service_key_role=${keyClaims.role ?? "UNKNOWN"}`,
        `url_key_project_parity=${refParity === null ? "UNKNOWN" : refParity}`,
        `sms_provider=${this.smsProvider}`,
        `at_username=${this.at.username || "MISSING"}`,
        `at_from=${this.at.from ?? "(account default)"}`,
        `delivery_token_set=${Boolean(this.deliveryReportToken)}`,
        `worker_admin_token_set=${Boolean(this.adminToken)}`,
        `worker_interval_ms=${this.worker.intervalMs}`,
      ].join("\n  ")
    );

    if (refParity === false) {
      this.logger.error(
        `ENV MISMATCH: SUPABASE_URL project (${urlRef}) != service-role key project ` +
          `(${keyClaims.ref}). This process is pointed at a DIFFERENT Supabase project ` +
          `than its key — it will drain the wrong database and rows will sit pending.`
      );
    }
    if (keyClaims.role && keyClaims.role !== "service_role") {
      this.logger.error(
        `ENV MISMATCH: SUPABASE_SERVICE_ROLE_KEY carries role="${keyClaims.role}", ` +
          `expected "service_role". RLS will block claim_sms_batch and the queue never drains.`
      );
    }
  }
}

/** Project ref = the subdomain of the Supabase URL (e.g. abcd1234.supabase.co). */
function projectRefFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Read the non-secret claims (ref, role) from a Supabase JWT WITHOUT verifying
 * the signature. ref/role are public identifiers, not secrets — used only to
 * assert the key belongs to the same project as SUPABASE_URL.
 */
function decodeSupabaseKeyClaims(key: string): { ref?: string; role?: string } {
  try {
    const payload = key.split(".")[1];
    if (!payload) return {};
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { ref?: string; role?: string };
    return { ref: claims.ref, role: claims.role };
  } catch {
    return {};
  }
}

/** Mask a secret for logs: presence + length only (never the value). */
function maskToken(token?: string): string {
  return token ? `set(len=${token.length})` : "unset";
}
