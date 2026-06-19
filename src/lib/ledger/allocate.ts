import { comparePeriods } from "./period";
import type {
  Allocation,
  AllocationResult,
  Charge,
  ChargeSettlement,
  Payment,
} from "./types";

/**
 * THE PAYMENT ALLOCATION ENGINE.
 *
 * Pure, deterministic, framework-free. Given the immutable set of charges and
 * payments for a tenant, it computes how every payment settles against rent,
 * oldest charge first (FIFO), and what credit remains.
 *
 * RULE: payments always clear the OLDEST unpaid rent first.
 *
 * The engine processes payments in chronological order; each payment cascades
 * into the oldest charge with a remaining balance, then the next, until the
 * payment is exhausted. Anything left over after all charges are satisfied
 * becomes forward credit (advance payment).
 *
 * This function NEVER mutates its inputs and reads no external state, so the
 * same inputs always yield the same result — which is exactly what lets us
 * recompute the ledger from scratch and trust it.
 */
export function allocate(charges: Charge[], payments: Payment[]): AllocationResult {
  // Sort charges oldest -> newest. Stable tiebreak on dueDate then id so the
  // result is fully deterministic regardless of input order.
  const sortedCharges = [...charges].sort((a, b) => {
    const byPeriod = comparePeriods(a.periodMonth, b.periodMonth);
    if (byPeriod !== 0) return byPeriod;
    const byDue = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    if (byDue !== 0) return byDue;
    return a.id.localeCompare(b.id);
  });

  // Sort payments oldest -> newest (chronological FIFO).
  const sortedPayments = [...payments].sort((a, b) => {
    const byDate = a.paidAt.localeCompare(b.paidAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  // Working settlement state per charge.
  const state = sortedCharges.map((c) => ({
    chargeId: c.id,
    periodMonth: c.periodMonth,
    charged: c.amount,
    paid: 0,
    remaining: c.amount,
  }));

  const allocations: Allocation[] = [];
  let creditRemaining = 0;

  for (const payment of sortedPayments) {
    let pool = payment.amount;

    for (const cs of state) {
      if (pool <= 0) break;
      if (cs.remaining <= 0) continue;

      const applied = Math.min(pool, cs.remaining);
      cs.remaining -= applied;
      cs.paid += applied;
      pool -= applied;
      allocations.push({ paymentId: payment.id, chargeId: cs.chargeId, amount: applied });
    }

    if (pool > 0) {
      // Leftover after exhausting all charges = advance credit.
      creditRemaining += pool;
      allocations.push({ paymentId: payment.id, chargeId: null, amount: pool });
    }
  }

  const settlements: ChargeSettlement[] = state.map((cs) => ({
    chargeId: cs.chargeId,
    periodMonth: cs.periodMonth,
    charged: cs.charged,
    paid: cs.paid,
    remaining: cs.remaining,
  }));

  const totalCharged = sortedCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = sortedPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    allocations,
    settlements,
    creditRemaining,
    totalCharged,
    totalPaid,
    balance: totalCharged - totalPaid, // + owes, - credit
  };
}
