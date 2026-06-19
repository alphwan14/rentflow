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
  }
}

/** Mask a secret for logs: presence + length only (never the value). */
function maskToken(token?: string): string {
  return token ? `set(len=${token.length})` : "unset";
}
