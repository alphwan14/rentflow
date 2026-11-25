/**
 * Kenyan phone numbers. Canonical form is 12 digits without "+": 2547XXXXXXXX
 * or 2541XXXXXXXX. M-Pesa statements often mask the middle ("2547******678",
 * "0712***678"); those are kept as masks and matched by their visible digits.
 */

export type PhoneMask = { prefix: string; suffix: string; length: number };

/** Normalise any common Kenyan format to 2547XXXXXXXX. Returns null if not a valid mobile number. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/\*/.test(String(input))) return null;
  let d = digits;
  if (/^0[17]\d{8}$/.test(d)) d = "254" + d.slice(1);
  else if (/^[17]\d{8}$/.test(d)) d = "254" + d;
  else if (/^2540[17]\d{8}$/.test(d)) d = "254" + d.slice(4);
  if (/^254[17]\d{8}$/.test(d)) return d;
  return null;
}

/**
 * Parse a masked phone like "2547******678", "0712***678" or "254712***678".
 * Returns the visible prefix/suffix in canonical (254…) form.
 */
export function parsePhoneMask(input: string | null | undefined): PhoneMask | null {
  if (!input) return null;
  const s = String(input).replace(/[\s-]/g, "").replace(/^\+/, "");
  const m = /^(\d+)(\*+|x+|X+)(\d+)$/.exec(s);
  if (!m) return null;
  let prefix = m[1];
  const suffix = m[3];
  if (prefix.startsWith("0")) prefix = "254" + prefix.slice(1);
  // Statements don't always print one star per hidden digit ("2547******678"),
  // so only the visible digits are trusted. Canonical numbers are 12 digits.
  if (!/^254[17]/.test(prefix) || prefix.length + suffix.length >= 12 || suffix.length < 2) return null;
  return { prefix, suffix, length: 12 };
}

export function phoneMatchesMask(phone: string, mask: PhoneMask): boolean {
  return phone.length === mask.length && phone.startsWith(mask.prefix) && phone.endsWith(mask.suffix);
}

/** "0712 345 678" for display. */
export function formatPhone(canonical: string | null | undefined): string {
  if (!canonical) return "";
  const n = normalizePhone(canonical);
  if (!n) return canonical;
  const local = "0" + n.slice(3);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Extract every phone-looking token from free text (pasted lists, notebook cells). */
export function extractPhones(text: string): string[] {
  const found = new Set<string>();
  const re = /(?:\+?254|0)?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}/g;
  for (const m of text.matchAll(re)) {
    const n = normalizePhone(m[0]);
    if (n) found.add(n);
  }
  return [...found];
}
