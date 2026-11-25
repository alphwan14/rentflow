/**
 * Billing periods are calendar months, represented as ISO dates of the first of
 * the month ("2026-10-01"). All date math is done on plain "YYYY-MM-DD" strings
 * in UTC so server, browser and Postgres agree regardless of timezone.
 */

export type ISODate = string; // YYYY-MM-DD

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Today's date in Nairobi (UTC+3, no DST) as YYYY-MM-DD. */
export function todayNairobi(now: Date = new Date()): ISODate {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function periodOf(date: ISODate): ISODate {
  return date.slice(0, 7) + "-01";
}

export function addMonths(period: ISODate, n: number): ISODate {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

export function daysInMonth(period: ISODate): number {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Due date for a period given a due day (clamped to month length). */
export function dueDateFor(period: ISODate, dueDay: number): ISODate {
  const d = Math.min(Math.max(1, dueDay), daysInMonth(period));
  return period.slice(0, 8) + String(d).padStart(2, "0");
}

/** Months from `from` to `to` inclusive (both periods). */
export function monthsBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let p = periodOf(from);
  const end = periodOf(to);
  while (p <= end && out.length < 600) {
    out.push(p);
    p = addMonths(p, 1);
  }
  return out;
}

/** "Oct 2026" */
export function formatPeriod(period: ISODate, long = false): string {
  const m = Number(period.slice(5, 7)) - 1;
  return `${(long ? MONTHS_LONG : MONTHS)[m]} ${period.slice(0, 4)}`;
}

/** "Oct" */
export function formatMonthShort(period: ISODate): string {
  return MONTHS[Number(period.slice(5, 7)) - 1];
}

/** "5 Oct 2026" */
export function formatDate(date: ISODate | null | undefined): string {
  if (!date) return "";
  const d = date.slice(0, 10);
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

export function monthIndexFromName(name: string): number | null {
  const n = name.trim().slice(0, 3).toLowerCase();
  const i = MONTHS.findIndex((m) => m.toLowerCase() === n);
  return i === -1 ? null : i;
}
