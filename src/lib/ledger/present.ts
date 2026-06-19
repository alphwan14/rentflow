import { formatMoney } from "./money";
import { formatPeriod, periodFromDate, type Period } from "./period";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export interface StatusView {
  label: string; // short chip text, e.g. "Advance"
  detail: string; // human line, e.g. "Covered until August 2026"
  tone: Tone;
}

/** A DB date string "YYYY-MM-DD" -> period "YYYY-MM". */
export function periodFromDateString(d: string | null): Period | null {
  if (!d) return null;
  return d.slice(0, 7);
}

/** Human covered-until label, e.g. "Covered until August 2026". */
export function coveredUntilLabel(coveredUntil: string | null): string | null {
  const p = periodFromDateString(coveredUntil);
  return p ? `Covered until ${formatPeriod(p)}` : null;
}

/**
 * Derive the human-friendly status from a tenant's financials. Mirrors the
 * engine's deriveStatus() but works off the DB-computed fields so the dashboard
 * stays a single round-trip.
 */
export function presentStatus(args: {
  arrears: number;
  credit: number;
  coveredUntil: string | null;
  overdueDays: number;
  hasCharges: boolean;
  today?: Date;
}): StatusView {
  const { arrears, credit, coveredUntil, overdueDays, hasCharges } = args;
  const today = args.today ?? new Date();

  if (arrears > 0) {
    if (overdueDays > 0) {
      return {
        label: "Overdue",
        detail: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"} · ${formatMoney(arrears)}`,
        tone: "bad",
      };
    }
    return { label: "Partial", detail: `Balance remaining ${formatMoney(arrears)}`, tone: "warn" };
  }

  // No arrears.
  const coveredPeriod = periodFromDateString(coveredUntil);
  if (coveredPeriod) {
    const current = periodFromDate(today);
    const ahead = coveredPeriod > current; // "YYYY-MM" string compare is chronological
    if (ahead) {
      return { label: "Advance", detail: `Covered until ${formatPeriod(coveredPeriod)}`, tone: "good" };
    }
  }
  if (credit > 0) {
    return { label: "Credit", detail: `Credit balance ${formatMoney(credit)}`, tone: "info" };
  }
  if (!hasCharges) {
    return { label: "New", detail: "No rent billed yet", tone: "neutral" };
  }
  return { label: "Paid", detail: "Up to date", tone: "good" };
}

export const TONE_CLASSES: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
  bad: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
