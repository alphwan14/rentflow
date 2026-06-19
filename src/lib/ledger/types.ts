import type { Money } from "./money";
import type { Period } from "./period";

/**
 * Domain inputs to the allocation engine. These are deliberately minimal and
 * framework-free: just the immutable financial facts. The engine never reads
 * the database, never mutates input, and is fully deterministic.
 */

export interface Charge {
  id: string;
  periodMonth: Period; // "YYYY-MM"
  amount: Money; // cents, > 0
  dueDate?: string; // ISO date, optional tiebreak / overdue calc
}

export interface Payment {
  id: string;
  amount: Money; // cents, > 0
  paidAt: string; // ISO datetime — drives FIFO chronological order
}

/** One slice of a payment applied to one charge (chargeId null = unallocated credit). */
export interface Allocation {
  paymentId: string;
  chargeId: string | null;
  amount: Money; // cents
}

export interface ChargeSettlement {
  chargeId: string;
  periodMonth: Period;
  charged: Money;
  paid: Money;
  remaining: Money; // 0 = fully cleared
}

export interface AllocationResult {
  /** Per-(payment,charge) slices, including null-charge credit slices. */
  allocations: Allocation[];
  /** Settlement state of each charge after applying all payments. */
  settlements: ChargeSettlement[];
  /** Leftover money not absorbed by any charge = forward credit / advance. */
  creditRemaining: Money;
  /** Total charged across all charges. */
  totalCharged: Money;
  /** Total paid across all payments. */
  totalPaid: Money;
  /** Net balance: positive = tenant owes (arrears), negative = credit. */
  balance: Money;
}
