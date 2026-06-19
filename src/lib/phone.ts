/**
 * Kenyan phone normalization to E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
 * Mirrors the backend `normalize_ke_phone` SQL function and the worker's
 * normalizer so a number is canonical the moment it's stored — long before it
 * reaches the SMS queue.
 */
export interface NormalizedPhone {
  e164: string;
  recognized: boolean;
}

export function normalizeKenyanPhone(input: string): NormalizedPhone {
  const cleaned = input.trim().replace(/[^\d+]/g, "");
  if (/^\+254[17]\d{8}$/.test(cleaned)) return { e164: cleaned, recognized: true };
  if (/^254[17]\d{8}$/.test(cleaned)) return { e164: `+${cleaned}`, recognized: true };
  if (/^0[17]\d{8}$/.test(cleaned)) return { e164: `+254${cleaned.slice(1)}`, recognized: true };
  if (/^[17]\d{8}$/.test(cleaned)) return { e164: `+254${cleaned}`, recognized: true };
  return { e164: cleaned, recognized: false };
}
