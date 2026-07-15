import { createHash, timingSafeEqual } from "crypto";

/**
 * Webhook/admin authentication helpers.
 *
 * Africa's Talking does NOT sign delivery-report callbacks (no HMAC header),
 * and its dashboard can only be configured with a bare URL — no custom
 * headers. Callback authenticity therefore rests on layered checks:
 *   1. a shared secret in the URL PATH (never the query string, which is far
 *      more likely to be captured in access logs), compared in constant time;
 *   2. message-id correlation — a report only ever applies to a row this
 *      system actually sent and that is awaiting confirmation (enforced in
 *      SmsRepository.applyDeliveryReport);
 *   3. an optional source-IP allowlist (DELIVERY_REPORT_ALLOWED_IPS) for the
 *      egress ranges Africa's Talking support can provide.
 */

/** Constant-time token comparison (hash first so lengths never leak). */
export function tokensMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** "1.2.3.4, 196.216." → ["1.2.3.4", "196.216."]; empty/undefined → []. */
export function parseIpAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Entry forms: exact IP ("196.216.167.9") or prefix ending in "."
 * ("196.216." matches the whole range). Empty allowlist = check disabled.
 */
export function ipAllowed(ip: string | null | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  const norm = ip.replace(/^::ffff:/, "").trim();
  return allowlist.some((entry) => (entry.endsWith(".") ? norm.startsWith(entry) : norm === entry));
}

/** Client IP behind Render's proxy: first X-Forwarded-For hop, else socket. */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined
): string | undefined {
  const xf = headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const first = (raw ?? "").split(",")[0].trim();
  return first || socketRemoteAddress;
}
