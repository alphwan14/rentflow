/**
 * Billing periods are represented as "YYYY-MM" strings (e.g. "2026-06").
 * Pure string/number arithmetic only — no Date timezone surprises, no mutation.
 */

export type Period = string; // "YYYY-MM"

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(p: string): p is Period {
  return PERIOD_RE.test(p);
}

/** "2026-06" -> { year: 2026, month: 6 } (month is 1-based). */
export function parsePeriod(p: Period): { year: number; month: number } {
  const [y, m] = p.split("-");
  return { year: Number(y), month: Number(m) };
}

export function makePeriod(year: number, month1: number): Period {
  // month1 is 1-based; normalize overflow/underflow.
  const zero = month1 - 1;
  const year2 = year + Math.floor(zero / 12);
  const month2 = ((zero % 12) + 12) % 12; // 0-based, always positive
  return `${String(year2).padStart(4, "0")}-${String(month2 + 1).padStart(2, "0")}`;
}

/** Shift a period by n months (n may be negative). */
export function addMonths(p: Period, n: number): Period {
  const { year, month } = parsePeriod(p);
  return makePeriod(year, month + n);
}

/** Number of whole months from a -> b (b - a). Negative if b is before a. */
export function monthsBetween(a: Period, b: Period): number {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function comparePeriods(a: Period, b: Period): number {
  return monthsBetween(b, a); // >0 if a after b
}

/** Convert a JS Date to its period. Used at the edge (e.g. "today"). */
export function periodFromDate(d: Date): Period {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August 2026" for human-friendly display. */
export function formatPeriod(p: Period): string {
  const { year, month } = parsePeriod(p);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
