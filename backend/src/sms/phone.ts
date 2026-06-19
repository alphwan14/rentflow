/**
 * Normalize Kenyan phone numbers to E.164 (+2547XXXXXXXX / +2541XXXXXXXX),
 * which is what Africa's Talking expects for delivery. Pure & testable.
 *
 * Accepts the common local formats:
 *   0756528219      -> +254756528219   (leading 0, 10 digits)
 *   254756528219    -> +254756528219   (country code, no +)
 *   +254756528219   -> +254756528219   (already E.164)
 *   0712 345 678 / 0712-345-678        (separators stripped)
 *
 * If the input doesn't match a recognizable Kenyan pattern, the cleaned input
 * is returned unchanged (best effort) and `recognized` is false so callers can
 * warn rather than silently mis-send.
 */
export interface NormalizedPhone {
  e164: string;
  recognized: boolean;
}

export function normalizeKenyanPhone(input: string): NormalizedPhone {
  // Strip everything except digits and a leading +.
  const cleaned = input.trim().replace(/[^\d+]/g, "");

  // +254 7XX XXX XXX (or 1XX) — already E.164.
  if (/^\+254[17]\d{8}$/.test(cleaned)) {
    return { e164: cleaned, recognized: true };
  }
  // 254 7XX XXX XXX (missing +).
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return { e164: `+${cleaned}`, recognized: true };
  }
  // 0 7XX XXX XXX (local, leading 0).
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return { e164: `+254${cleaned.slice(1)}`, recognized: true };
  }
  // 7XX XXX XXX (9 digits, no prefix at all).
  if (/^[17]\d{8}$/.test(cleaned)) {
    return { e164: `+254${cleaned}`, recognized: true };
  }

  return { e164: cleaned, recognized: false };
}
