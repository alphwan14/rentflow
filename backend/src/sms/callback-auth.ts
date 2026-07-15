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

// ---------------------------------------------------------------------------
// Forensic instrumentation — describes tokens WITHOUT ever exposing them.
// ---------------------------------------------------------------------------

export interface TokenDescriptor {
  exists: boolean;
  length: number;
  /** First 12 hex chars of sha256 — enough to compare, impossible to reverse. */
  sha12: string;
  containsPlus: boolean;
  containsSlash: boolean;
  containsEquals: boolean;
  leadingWhitespace: boolean;
  trailingWhitespace: boolean;
  urlDecodedChangesValue: boolean;
}

export function sha12(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** decodeURIComponent that never throws (malformed %-sequences return input). */
export function safeUrlDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function describeToken(value: string | null | undefined): TokenDescriptor {
  if (!value) {
    return {
      exists: false,
      length: 0,
      sha12: "",
      containsPlus: false,
      containsSlash: false,
      containsEquals: false,
      leadingWhitespace: false,
      trailingWhitespace: false,
      urlDecodedChangesValue: false,
    };
  }
  return {
    exists: true,
    length: value.length,
    sha12: sha12(value),
    containsPlus: value.includes("+"),
    containsSlash: value.includes("/"),
    containsEquals: value.includes("="),
    leadingWhitespace: value !== value.replace(/^\s+/, ""),
    trailingWhitespace: value !== value.replace(/\s+$/, ""),
    urlDecodedChangesValue: safeUrlDecode(value) !== value,
  };
}

/**
 * Semantically-equivalent forms a correct token might arrive in after
 * transport (surrounding whitespace, %-encoding, a trailing slash from the
 * dashboard URL). Order = preference; "raw" first so clean tokens report as
 * raw matches.
 */
export function candidateForms(raw: string): Array<{ form: string; value: string }> {
  const out: Array<{ form: string; value: string }> = [];
  const push = (form: string, value: string) => {
    if (value && !out.some((c) => c.value === value)) out.push({ form, value });
  };
  push("raw", raw);
  push("trimmed", raw.trim());
  push("url_decoded", safeUrlDecode(raw));
  push("trimmed_url_decoded", safeUrlDecode(raw.trim()));
  push("trailing_slash_stripped", raw.trim().replace(/\/+$/, ""));
  return out;
}

/** One precise, safe reason for a failed comparison. */
export function diagnoseMismatch(
  provided: string | null | undefined,
  expected: string | null | undefined
): string {
  if (!expected) return "env_token_missing";
  if (!provided) return "no_token_supplied";
  if (provided.trim() !== provided) return "whitespace_around_token";
  if (safeUrlDecode(provided) !== provided) return "url_encoding_changed_value";
  if (provided.length !== expected.length)
    return `length_mismatch_received_${provided.length}_expected_${expected.length}`;
  return "same_length_hashes_differ_wrong_token_configured";
}
