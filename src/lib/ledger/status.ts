import { allocate } from "./allocate";
import type { Money } from "./money";
import {
  addMonths,
  comparePeriods,
  monthsBetween,
  periodFromDate,
  type Period,
} from "./period";
import type { Charge, Payment } from "./types";

/**
 * Human-friendly tenant status. Deliberately NOT accounting jargon — these map
 * straight onto reassuring UI language ("Covered until August", "Overdue by 12
 * days"). Status is ALWAYS derived, never stored.
 */
export type TenantStatusKind =
  | "paid" // settled up to and including the current month, nothing extra
  | "partial" // current/most-recent month part-paid, still owes some
  | "overdue" // owes money past the due date
  | "advance" // covered into future months
  | "credit" // has leftover credit not yet covering a full month
  | "no_charges"; // brand new — nothing billed yet

export interface TenantStatus {
  kind: TenantStatusKind;
  /** Net balance in cents: positive = owes (arrears), negative = credit. */
  balance: Money;
  arrears: Money; // amount owed (>= 0)
  credit: Money; // leftover credit (>= 0)
  /** Latest month fully covered, projecting forward credit. Null if nothing covered. */
  coveredUntil: Period | null;
  /** Days overdue (>= 0). 0 when not overdue. */
  overdueDays: number;
  /** Short human label, e.g. "Covered until August 2026" — built in the UI from these fields. */
}

export interface DeriveStatusInput {
  charges: Charge[];
  payments: Payment[];
  monthlyRent: Money; // current monthly rent (for forward projection)
  /** "Now" — injected so the function stays pure/testable. */
  today: Date;
  /** Day of month rent is due (1-31). Used for overdue-days. */
  dueDay?: number;
}

/**
 * Derive a tenant's complete current status from immutable events.
 *
 * coveredUntil logic:
 *   - The charges are filled oldest-first, so fully-cleared charges form a
 *     contiguous prefix; the last cleared charge is the "covered base".
 *   - Any remaining credit projects forward in whole months of monthlyRent
 *     beyond that base.
 */
export function deriveStatus(input: DeriveStatusInput): TenantStatus {
  const { charges, payments, monthlyRent, today, dueDay } = input;
  const result = allocate(charges, payments);

  const arrears = Math.max(0, result.balance);
  const credit = Math.max(0, -result.balance);

  // ---- coveredUntil ----------------------------------------------------
  // Fully-cleared charges (remaining === 0), latest period wins.
  const clearedPeriods = result.settlements
    .filter((s) => s.remaining === 0)
    .map((s) => s.periodMonth);

  let coveredBase: Period | null = null;
  for (const p of clearedPeriods) {
    if (coveredBase === null || comparePeriods(p, coveredBase) > 0) coveredBase = p;
  }

  let coveredUntil: Period | null = coveredBase;
  if (credit > 0 && monthlyRent > 0) {
    const extraMonths = Math.floor(credit / monthlyRent);
    if (extraMonths > 0) {
      if (coveredBase) {
        coveredUntil = addMonths(coveredBase, extraMonths);
      } else {
        // No charges cleared yet (e.g. pure advance before billing). Project
        // from the current month: the current month plus (extra - 1) more.
        coveredUntil = addMonths(periodFromDate(today), extraMonths - 1);
      }
    }
  }

  // ---- overdueDays -----------------------------------------------------
  let overdueDays = 0;
  if (arrears > 0) {
    // Oldest charge that still has a remaining balance defines the overdue clock.
    const oldestUnpaid = result.settlements
      .filter((s) => s.remaining > 0)
      .sort((a, b) => comparePeriods(a.periodMonth, b.periodMonth))[0];
    if (oldestUnpaid) {
      const due = dueDateForPeriod(oldestUnpaid.periodMonth, dueDay);
      const diffMs = today.getTime() - due.getTime();
      overdueDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  // ---- status kind -----------------------------------------------------
  const kind = classify({
    hasCharges: charges.length > 0,
    arrears,
    credit,
    overdueDays,
    coveredUntil,
    today,
  });

  return {
    kind,
    balance: result.balance,
    arrears,
    credit,
    coveredUntil,
    overdueDays,
  };
}

function classify(args: {
  hasCharges: boolean;
  arrears: Money;
  credit: Money;
  overdueDays: number;
  coveredUntil: Period | null;
  today: Date;
}): TenantStatusKind {
  const { hasCharges, arrears, credit, overdueDays, coveredUntil, today } = args;

  if (!hasCharges && credit === 0) return "no_charges";

  if (arrears > 0) {
    return overdueDays > 0 ? "overdue" : "partial";
  }

  // No arrears. Are they ahead into future months?
  if (coveredUntil) {
    const currentPeriod = periodFromDate(today);
    if (monthsBetween(currentPeriod, coveredUntil) > 0) return "advance";
  }
  if (credit > 0) return "credit";
  return "paid";
}

/** The due date for a billing period, given the tenant's due day-of-month. */
function dueDateForPeriod(period: Period, dueDay = 1): Date {
  const [y, m] = period.split("-").map(Number);
  // Clamp dueDay to the month's length.
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return new Date(y, m - 1, day);
}
