/**
 * Money is always an integer number of cents (KES × 100). Never floats.
 *
 * In TypeScript we use `number` for cents: the largest safe integer is
 * ~9 × 10^15 cents (KES 90 trillion), far beyond any rent book. Postgres stores
 * the same values as `bigint`.
 */
export type Cents = number;

export class MoneyParseError extends Error {}

/** Assert a value is a whole number of cents. */
export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyParseError(`${label} must be a whole number of cents, got ${value}`);
  }
  return value;
}

/**
 * Parse a human/statement amount string into cents without floating point.
 * Accepts "15,000", "15000.00", "KES 15,000.50", "Ksh15,000", "-1,000.00",
 * "(1,000.00)". Returns null for empty input; throws on garbage.
 */
export function parseCents(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyParseError(`Invalid amount: ${input}`);
    // Spreadsheet cells arrive as numbers. Round via string to avoid 0.1+0.2 drift.
    return parseCents(input.toFixed(2));
  }
  let s = input.trim();
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(kes|ksh|kshs|sh)\.?\s*/i, "").replace(/[\s,]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyParseError(`Invalid amount: "${input}"`);
  const whole = Number(m[1]);
  const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) throw new MoneyParseError(`Amount too large: "${input}"`);
  return negative ? -cents : cents;
}

/** Whole shillings → cents. */
export function kes(shillings: number): Cents {
  return assertCents(Math.round(shillings * 100), "shillings");
}

const grouping = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

/**
 * "KES 184,000" — whole shillings unless there are cents ("KES 1,250.50").
 * Negative values render as "−KES 1,000" (credit).
 */
export function formatKES(cents: Cents, opts: { sign?: boolean; currency?: boolean } = {}): string {
  const { sign = false, currency = true } = opts;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = grouping.format(whole) + (frac ? "." + String(frac).padStart(2, "0") : "");
  const prefix = currency ? "KES " : "";
  if (cents < 0) return `−${prefix}${body}`;
  if (sign && cents > 0) return `+${prefix}${body}`;
  return `${prefix}${body}`;
}

/** Compact form for chart axes: "184K", "1.2M". */
export function formatKESCompact(cents: Cents): string {
  const v = Math.abs(cents) / 100;
  const s = v >= 1_000_000 ? `${trim(v / 1_000_000)}M` : v >= 1_000 ? `${trim(v / 1_000)}K` : String(Math.round(v));
  return cents < 0 ? `−${s}` : s;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
