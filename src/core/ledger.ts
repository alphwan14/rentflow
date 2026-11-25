/**
 * The ledger is append-only. Balances and allocations are always derived from
 * the full list of entries for a lease — never stored.
 *
 * Sign convention: amount > 0 increases what the tenant owes (a charge),
 * amount < 0 reduces it (a payment or credit). A reversal entry carries the
 * opposite amount of the entry it reverses and points to it via `reversesId`.
 */
import type { Cents } from "./money";
import { addMonths, periodOf, type ISODate } from "./period";

export type ChargeKind =
  | "rent"
  | "water"
  | "garbage"
  | "service"
  | "late_fee"
  | "deposit"
  | "arrears_bf"
  | "other";

export type EntryKind = "charge" | "payment" | "adjustment" | "reversal";

export interface LedgerEntry {
  id: string;
  kind: EntryKind;
  amountCents: Cents;
  /** Date the entry takes effect: due date for charges, paid date for payments. */
  effectiveDate: ISODate;
  /** Tie-breaker for entries on the same date (creation order). */
  seq?: number;
  chargeKind?: ChargeKind | null;
  period?: ISODate | null;
  reversesId?: string | null;
  paymentId?: string | null;
  description?: string | null;
}

export interface AllocatedCharge {
  entryId: string;
  chargeKind: ChargeKind;
  period: ISODate | null;
  dueDate: ISODate;
  amountCents: Cents;
  paidCents: Cents;
  outstandingCents: Cents;
  /** Date of the credit that finished paying this charge, if fully paid. */
  settledOn: ISODate | null;
  description: string | null;
}

export interface LeaseStatement {
  /** > 0 owed, < 0 credit. */
  balanceCents: Cents;
  owedCents: Cents;
  creditCents: Cents;
  charges: AllocatedCharge[];
  oldestUnpaidDue: ISODate | null;
  /** Last month whose rent is fully paid (includes months prepaid by credit). */
  coveredUntil: ISODate | null;
}

function byDate(a: { effectiveDate: ISODate; seq?: number }, b: { effectiveDate: ISODate; seq?: number }) {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
  return (a.seq ?? 0) - (b.seq ?? 0);
}

/**
 * Remove entries that have been reversed, along with their reversals.
 * Partial reversals are not allowed: a reversal always mirrors its original.
 */
export function activeEntries(entries: readonly LedgerEntry[]): LedgerEntry[] {
  const reversed = new Set(entries.filter((e) => e.kind === "reversal" && e.reversesId).map((e) => e.reversesId!));
  return entries.filter((e) => e.kind !== "reversal" && !reversed.has(e.id));
}

export function balanceOf(entries: readonly LedgerEntry[]): Cents {
  let total = 0;
  for (const e of entries) total += e.amountCents;
  return total;
}

/**
 * Allocate credits to debits, oldest debt first. Credits are consumed in the
 * order they were received; a credit received before a debt existed (prepaid)
 * is applied as soon as that debt appears.
 */
export function buildStatement(
  entries: readonly LedgerEntry[],
  opts: { monthlyRentCents?: Cents } = {},
): LeaseStatement {
  const live = activeEntries(entries);
  const debits = live.filter((e) => e.amountCents > 0).sort(byDate);
  const credits = live
    .filter((e) => e.amountCents < 0)
    .sort(byDate)
    .map((e) => ({ date: e.effectiveDate, remaining: -e.amountCents }));

  let ci = 0;
  const charges: AllocatedCharge[] = debits.map((d) => {
    let need = d.amountCents;
    let settledOn: ISODate | null = null;
    while (need > 0 && ci < credits.length) {
      const c = credits[ci];
      const take = Math.min(need, c.remaining);
      need -= take;
      c.remaining -= take;
      if (need === 0) settledOn = c.date > d.effectiveDate ? c.date : d.effectiveDate;
      if (c.remaining === 0) ci++;
    }
    return {
      entryId: d.id,
      chargeKind: (d.chargeKind ?? (d.kind === "adjustment" ? "other" : "rent")) as ChargeKind,
      period: d.period ?? null,
      dueDate: d.effectiveDate,
      amountCents: d.amountCents,
      paidCents: d.amountCents - need,
      outstandingCents: need,
      settledOn,
      description: d.description ?? null,
    };
  });

  const creditCents = credits.slice(ci).reduce((s, c) => s + c.remaining, 0);
  const owedCents = charges.reduce((s, c) => s + c.outstandingCents, 0);
  const balanceCents = owedCents - creditCents;
  const firstUnpaid = charges.find((c) => c.outstandingCents > 0) ?? null;

  return {
    balanceCents,
    owedCents,
    creditCents,
    charges,
    oldestUnpaidDue: firstUnpaid?.dueDate ?? null,
    coveredUntil: coveredUntil(charges, creditCents, opts.monthlyRentCents ?? 0),
  };
}

function coveredUntil(charges: AllocatedCharge[], creditCents: Cents, rentCents: Cents): ISODate | null {
  const rent = charges.filter((c) => c.chargeKind === "rent" && c.period);
  // Last rent month fully paid with no unpaid rent before it.
  let lastPaid: ISODate | null = null;
  for (const c of rent) {
    if (c.outstandingCents > 0) return lastPaid;
    lastPaid = c.period!;
  }
  if (!lastPaid) return null;
  // Everything billed is paid; spare credit prepays future months.
  if (rentCents > 0 && creditCents >= rentCents) {
    return addMonths(lastPaid, Math.floor(creditCents / rentCents));
  }
  return lastPaid;
}

export type PayStatus = "paid" | "partial" | "unpaid";

/**
 * Status of a lease for the current month, used for the green/amber/red chips.
 *  - paid:    nothing owed
 *  - partial: something owed, but money came in this period
 *  - unpaid:  something owed and nothing received this period
 */
export function payStatus(entries: readonly LedgerEntry[], today: ISODate): PayStatus {
  const live = activeEntries(entries);
  if (balanceOf(live) <= 0) return "paid";
  const period = periodOf(today);
  const paidThisPeriod = live.some((e) => e.amountCents < 0 && e.kind === "payment" && e.effectiveDate >= period);
  return paidThisPeriod ? "partial" : "unpaid";
}

/**
 * Explain how a new payment will be applied to currently open charges
 * (for receipts and the confirm screen). Does not mutate anything.
 */
export function previewPayment(
  statement: LeaseStatement,
  amountCents: Cents,
): { cleared: { entryId: string; label: string; cents: Cents; full: boolean }[]; creditCents: Cents } {
  let left = amountCents;
  const cleared: { entryId: string; label: string; cents: Cents; full: boolean }[] = [];
  for (const c of statement.charges) {
    if (left <= 0) break;
    if (c.outstandingCents <= 0) continue;
    const take = Math.min(left, c.outstandingCents);
    left -= take;
    cleared.push({ entryId: c.entryId, label: chargeLabel(c), cents: take, full: take === c.outstandingCents });
  }
  return { cleared, creditCents: left + statement.creditCents };
}

const KIND_LABEL: Record<ChargeKind, string> = {
  rent: "Rent",
  water: "Water",
  garbage: "Garbage",
  service: "Service charge",
  late_fee: "Late fee",
  deposit: "Deposit",
  arrears_bf: "Balance brought forward",
  other: "Other",
};

export function chargeKindLabel(kind: ChargeKind): string {
  return KIND_LABEL[kind] ?? kind;
}

export function chargeLabel(c: Pick<AllocatedCharge, "chargeKind" | "period" | "description">): string {
  if (c.description) return c.description;
  const base = chargeKindLabel(c.chargeKind);
  if (!c.period) return base;
  const [y, m] = c.period.split("-");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${base} ${month} ${y}`;
}
