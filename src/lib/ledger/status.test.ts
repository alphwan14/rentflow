import { describe, expect, it } from "vitest";
import { toCents } from "./money";
import { deriveStatus } from "./status";
import type { Charge, Payment } from "./types";

function charge(id: string, periodMonth: string, kes: number): Charge {
  return { id, periodMonth, amount: toCents(kes) };
}
function payment(id: string, kes: number, paidAt: string): Payment {
  return { id, amount: toCents(kes), paidAt };
}

const RENT = toCents(10_000);

describe("deriveStatus", () => {
  it("'paid' when current month settled exactly", () => {
    const s = deriveStatus({
      charges: [charge("jun", "2026-06", 10_000)],
      payments: [payment("p1", 10_000, "2026-06-05T00:00:00Z")],
      monthlyRent: RENT,
      today: new Date("2026-06-20T00:00:00Z"),
      dueDay: 1,
    });
    expect(s.kind).toBe("paid");
    expect(s.balance).toBe(0);
    expect(s.coveredUntil).toBe("2026-06");
    expect(s.overdueDays).toBe(0);
  });

  it("'overdue' with day count when past due date and unpaid", () => {
    const s = deriveStatus({
      charges: [charge("jun", "2026-06", 10_000)],
      payments: [],
      monthlyRent: RENT,
      today: new Date("2026-06-13T00:00:00Z"),
      dueDay: 1,
    });
    expect(s.kind).toBe("overdue");
    expect(s.arrears).toBe(toCents(10_000));
    expect(s.overdueDays).toBe(12); // due Jun 1, today Jun 13
  });

  it("'partial' when part-paid but not yet past due", () => {
    const s = deriveStatus({
      charges: [charge("jun", "2026-06", 10_000)],
      payments: [payment("p1", 4_000, "2026-06-01T00:00:00Z")],
      monthlyRent: RENT,
      today: new Date("2026-06-01T00:00:00Z"), // exactly due day, 0 days overdue
      dueDay: 1,
    });
    expect(s.kind).toBe("partial");
    expect(s.arrears).toBe(toCents(6_000));
  });

  it("'advance' with covered-until projected forward (spec: 40k, rent 10k)", () => {
    const s = deriveStatus({
      charges: [charge("jun", "2026-06", 10_000)], // only June billed so far
      payments: [payment("p1", 40_000, "2026-06-01T00:00:00Z")],
      monthlyRent: RENT,
      today: new Date("2026-06-10T00:00:00Z"),
      dueDay: 1,
    });
    expect(s.kind).toBe("advance");
    // June cleared + 30k credit / 10k = 3 months -> September
    expect(s.coveredUntil).toBe("2026-09");
    expect(s.credit).toBe(toCents(30_000));
  });

  it("'credit' when leftover is less than a full month", () => {
    const s = deriveStatus({
      charges: [charge("jun", "2026-06", 10_000)],
      payments: [payment("p1", 13_000, "2026-06-01T00:00:00Z")],
      monthlyRent: RENT,
      today: new Date("2026-06-10T00:00:00Z"),
      dueDay: 1,
    });
    expect(s.kind).toBe("credit");
    expect(s.credit).toBe(toCents(3_000));
    expect(s.coveredUntil).toBe("2026-06"); // current month covered, no full extra month
  });

  it("'no_charges' for a brand-new tenant with nothing billed", () => {
    const s = deriveStatus({
      charges: [],
      payments: [],
      monthlyRent: RENT,
      today: new Date("2026-06-10T00:00:00Z"),
      dueDay: 1,
    });
    expect(s.kind).toBe("no_charges");
  });

  it("clamps due day to month length for overdue calc (Feb, dueDay 31)", () => {
    const s = deriveStatus({
      charges: [charge("feb", "2026-02", 10_000)],
      payments: [],
      monthlyRent: RENT,
      today: new Date("2026-03-05T00:00:00Z"),
      dueDay: 31, // Feb 2026 has 28 days -> clamps to Feb 28
    });
    expect(s.kind).toBe("overdue");
    expect(s.overdueDays).toBe(5); // Feb 28 -> Mar 5
  });
});
