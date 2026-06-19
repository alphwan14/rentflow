/**
 * Money in RentFlow is ALWAYS stored and computed as an integer number of
 * minor units (cents). Never floats — floating point drift is unacceptable in
 * a financial ledger. Display formatting happens only at the very edge (UI).
 *
 * 1 KES = 100 cents.
 */

export type Money = number; // integer minor units (cents)

export const CENTS_PER_UNIT = 100;

/** Convert whole KES (possibly fractional) to integer cents, rounded to nearest cent. */
export function toCents(kes: number): Money {
  return Math.round(kes * CENTS_PER_UNIT);
}

/** Convert integer cents to a KES number (may be fractional). */
export function toKES(cents: Money): number {
  return cents / CENTS_PER_UNIT;
}

/**
 * Format cents for display, e.g. 1500000 -> "KES 15,000".
 * Cents are shown only when non-zero (KES rarely uses cents in practice).
 */
export function formatMoney(cents: Money, opts: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = opts;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / CENTS_PER_UNIT);
  const remainder = abs % CENTS_PER_UNIT;

  const wholeStr = whole.toLocaleString("en-KE");
  const body = remainder === 0 ? wholeStr : `${wholeStr}.${String(remainder).padStart(2, "0")}`;

  const sign = negative ? "-" : "";
  return withSymbol ? `${sign}KES ${body}` : `${sign}${body}`;
}
