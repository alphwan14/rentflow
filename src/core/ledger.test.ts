import { describe, expect, it } from "vitest";
import { kes } from "./money";
import { buildStatement, payStatus, previewPayment, type LedgerEntry } from "./ledger";

let n = 0;
const rent = (period: string, amount = kes(15_000), due = period.slice(0, 8) + "05"): LedgerEntry => ({
  id: `c${++n}`,
  kind: "charge",
  chargeKind: "rent",
  period,
  amountCents: amount,
  effectiveDate: due,
});
const water = (period: string, amount: number): LedgerEntry => ({
  id: `w${++n}`,
  kind: "charge",
  chargeKind: "water",
  period,
  amountCents: amount,
  effectiveDate: period.slice(0, 8) + "10",
});
const pay = (date: string, amount: number): LedgerEntry => ({
  id: `p${++n}`,
  kind: "payment",
  amountCents: -amount,
  effectiveDate: date,
});
const reverse = (e: LedgerEntry, date = e.effectiveDate): LedgerEntry => ({
  id: `r${++n}`,
  kind: "reversal",
  amountCents: -e.amountCents,
  effectiveDate: date,
  reversesId: e.id,
});

describe("buildStatement: oldest debt first", () => {
  it("a payment clears the oldest month before the newest", () => {
    const entries = [rent("2026-08-01"), rent("2026-09-01"), rent("2026-10-01"), pay("2026-10-06", kes(20_000))];
    const s = buildStatement(entries, { monthlyRentCents: kes(15_000) });
    expect(s.charges.map((c) => c.outstandingCents)).toEqual([0, kes(10_000), kes(15_000)]);
    expect(s.balanceCents).toBe(kes(25_000));
    expect(s.oldestUnpaidDue).toBe("2026-09-05");
    expect(s.coveredUntil).toBe("2026-08-01");
  });

  it("rent paid in several parts (M-Pesa daily limit / salary in bits)", () => {
    const entries = [rent("2026-10-01"), pay("2026-10-02", kes(5_000)), pay("2026-10-09", kes(5_000)), pay("2026-10-15", kes(5_000))];
    const s = buildStatement(entries, { monthlyRentCents: kes(15_000) });
    expect(s.balanceCents).toBe(0);
    expect(s.charges[0].settledOn).toBe("2026-10-15");
    expect(payStatus(entries, "2026-10-20")).toBe("paid");
  });

  it("overpayment becomes credit and shows covered until", () => {
    const entries = [rent("2026-10-01"), pay("2026-10-01", kes(45_000))];
    const s = buildStatement(entries, { monthlyRentCents: kes(15_000) });
    expect(s.balanceCents).toBe(-kes(30_000));
    expect(s.creditCents).toBe(kes(30_000));
    expect(s.coveredUntil).toBe("2026-12-01");
  });

  it("prepaid credit is applied when the next month is billed", () => {
    const entries = [rent("2026-10-01"), pay("2026-10-01", kes(30_000)), rent("2026-11-01")];
    const s = buildStatement(entries, { monthlyRentCents: kes(15_000) });
    expect(s.balanceCents).toBe(0);
    expect(s.charges[1].settledOn).toBe("2026-11-05");
  });

  it("water and rent are cleared in due-date order", () => {
    const entries = [rent("2026-10-01"), water("2026-10-01", kes(800)), pay("2026-10-12", kes(15_500))];
    const s = buildStatement(entries);
    expect(s.charges.find((c) => c.chargeKind === "rent")!.outstandingCents).toBe(0);
    expect(s.charges.find((c) => c.chargeKind === "water")!.outstandingCents).toBe(kes(300));
  });

  it("reversals cancel the original entry (corrections never edit history)", () => {
    const p = pay("2026-10-05", kes(15_000));
    const entries = [rent("2026-10-01"), p, reverse(p, "2026-10-07")];
    const s = buildStatement(entries);
    expect(s.balanceCents).toBe(kes(15_000));
    expect(payStatus(entries, "2026-10-08")).toBe("unpaid");
  });

  it("balance brought forward is the oldest debt", () => {
    const bf: LedgerEntry = { id: "bf", kind: "charge", chargeKind: "arrears_bf", amountCents: kes(7_000), effectiveDate: "2026-07-31" };
    const s = buildStatement([rent("2026-08-01"), bf, pay("2026-08-05", kes(15_000))]);
    expect(s.charges[0].chargeKind).toBe("arrears_bf");
    expect(s.charges[0].outstandingCents).toBe(0);
    expect(s.charges[1].outstandingCents).toBe(kes(7_000));
  });
});

describe("payStatus", () => {
  it("is paid ahead when there is credit", () => {
    expect(payStatus([rent("2026-10-01"), pay("2026-10-02", kes(20_000))], "2026-10-20")).toBe("ahead");
  });
  it("is partial when money came this month but some is still owed", () => {
    const entries = [rent("2026-10-01"), pay("2026-10-03", kes(10_000))];
    expect(payStatus(entries, "2026-10-20")).toBe("partial");
  });
  it("is unpaid when nothing came this month", () => {
    const entries = [rent("2026-09-01"), pay("2026-09-03", kes(15_000)), rent("2026-10-01")];
    expect(payStatus(entries, "2026-10-20")).toBe("unpaid");
  });
});

describe("previewPayment", () => {
  it("explains what a payment clears", () => {
    const s = buildStatement([rent("2026-09-01"), rent("2026-10-01"), pay("2026-09-10", kes(10_000))]);
    const p = previewPayment(s, kes(25_000));
    expect(p.cleared.map((c) => [c.label, c.cents, c.full])).toEqual([
      ["September rent bill", kes(5_000), true],
      ["October rent bill", kes(15_000), true],
    ]);
    expect(p.creditCents).toBe(kes(5_000));
  });
});
