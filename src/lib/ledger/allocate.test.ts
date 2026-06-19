import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import { toCents } from "./money";
import type { Charge, Payment } from "./types";

function charge(id: string, periodMonth: string, kes: number): Charge {
  return { id, periodMonth, amount: toCents(kes) };
}
function payment(id: string, kes: number, paidAt: string): Payment {
  return { id, amount: toCents(kes), paidAt };
}

const rem = (r: ReturnType<typeof allocate>, chargeId: string) =>
  r.settlements.find((s) => s.chargeId === chargeId)!.remaining;

describe("allocate — FIFO oldest-first", () => {
  it("clears oldest unpaid rent first (spec example: 25k against 3x10k)", () => {
    const charges = [
      charge("apr", "2026-04", 10_000),
      charge("may", "2026-05", 10_000),
      charge("jun", "2026-06", 10_000),
    ];
    const payments = [payment("p1", 25_000, "2026-06-05T09:00:00Z")];

    const r = allocate(charges, payments);

    expect(rem(r, "apr")).toBe(0); // fully paid
    expect(rem(r, "may")).toBe(0); // fully paid
    expect(rem(r, "jun")).toBe(toCents(5_000)); // 5k remaining
    expect(r.creditRemaining).toBe(0);
    expect(r.balance).toBe(toCents(5_000)); // owes 5k
  });

  it("records which charge each payment slice cleared", () => {
    const charges = [charge("apr", "2026-04", 10_000), charge("may", "2026-05", 10_000)];
    const payments = [payment("p1", 15_000, "2026-04-05T00:00:00Z")];
    const r = allocate(charges, payments);
    const slices = r.allocations.filter((a) => a.paymentId === "p1");
    expect(slices).toEqual([
      { paymentId: "p1", chargeId: "apr", amount: toCents(10_000) },
      { paymentId: "p1", chargeId: "may", amount: toCents(5_000) },
    ]);
  });

  it("ignores input order — sorts charges by period and payments by date", () => {
    const charges = [
      charge("jun", "2026-06", 10_000),
      charge("apr", "2026-04", 10_000),
      charge("may", "2026-05", 10_000),
    ];
    const payments = [
      payment("p2", 10_000, "2026-06-10T09:00:00Z"),
      payment("p1", 15_000, "2026-06-01T09:00:00Z"),
    ];
    const r = allocate(charges, payments);
    // 25k total, oldest-first
    expect(rem(r, "apr")).toBe(0);
    expect(rem(r, "may")).toBe(0);
    expect(rem(r, "jun")).toBe(toCents(5_000));
  });

  it("handles a partial single payment", () => {
    const r = allocate([charge("jun", "2026-06", 10_000)], [payment("p1", 4_000, "2026-06-05T00:00:00Z")]);
    expect(rem(r, "jun")).toBe(toCents(6_000));
    expect(r.balance).toBe(toCents(6_000));
    expect(r.creditRemaining).toBe(0);
  });

  it("accumulates multiple partial payments onto the same charge", () => {
    const charges = [charge("jun", "2026-06", 10_000)];
    const payments = [
      payment("p1", 5_000, "2026-06-05T00:00:00Z"),
      payment("p2", 5_000, "2026-06-12T00:00:00Z"),
    ];
    const r = allocate(charges, payments);
    expect(rem(r, "jun")).toBe(0);
    expect(r.balance).toBe(0);
  });
});

describe("allocate — advance payments & credit", () => {
  it("absorbs advance into existing future charges, then leaves credit (spec: 40k, rent 10k)", () => {
    const charges = [
      charge("jun", "2026-06", 10_000),
      charge("jul", "2026-07", 10_000),
      charge("aug", "2026-08", 10_000),
      charge("sep", "2026-09", 10_000),
    ];
    const r = allocate(charges, [payment("p1", 40_000, "2026-06-01T00:00:00Z")]);
    expect(rem(r, "jun")).toBe(0);
    expect(rem(r, "jul")).toBe(0);
    expect(rem(r, "aug")).toBe(0);
    expect(rem(r, "sep")).toBe(0);
    expect(r.creditRemaining).toBe(0);
    expect(r.balance).toBe(0); // settled exactly
  });

  it("leaves leftover as forward credit when payment exceeds all charges", () => {
    const charges = [charge("jun", "2026-06", 10_000)];
    const r = allocate(charges, [payment("p1", 35_000, "2026-06-01T00:00:00Z")]);
    expect(rem(r, "jun")).toBe(0);
    expect(r.creditRemaining).toBe(toCents(25_000));
    expect(r.balance).toBe(toCents(-25_000)); // negative = credit
    // A null-charge credit allocation slice exists for traceability.
    const creditSlice = r.allocations.find((a) => a.chargeId === null);
    expect(creditSlice?.amount).toBe(toCents(25_000));
  });

  it("pure advance with no charges at all becomes full credit", () => {
    const r = allocate([], [payment("p1", 30_000, "2026-06-01T00:00:00Z")]);
    expect(r.creditRemaining).toBe(toCents(30_000));
    expect(r.balance).toBe(toCents(-30_000));
    expect(r.totalCharged).toBe(0);
  });
});

describe("allocate — integrity properties", () => {
  it("does not mutate inputs", () => {
    const charges = [charge("jun", "2026-06", 10_000)];
    const payments = [payment("p1", 5_000, "2026-06-05T00:00:00Z")];
    const chargesCopy = JSON.parse(JSON.stringify(charges));
    const paymentsCopy = JSON.parse(JSON.stringify(payments));
    allocate(charges, payments);
    expect(charges).toEqual(chargesCopy);
    expect(payments).toEqual(paymentsCopy);
  });

  it("conserves money: sum of allocations equals total paid", () => {
    const charges = [
      charge("apr", "2026-04", 10_000),
      charge("may", "2026-05", 7_500),
    ];
    const payments = [
      payment("p1", 12_000, "2026-04-03T00:00:00Z"),
      payment("p2", 9_000, "2026-05-02T00:00:00Z"),
    ];
    const r = allocate(charges, payments);
    const allocSum = r.allocations.reduce((s, a) => s + a.amount, 0);
    expect(allocSum).toBe(r.totalPaid);
  });

  it("balance always equals totalCharged - totalPaid", () => {
    const charges = [charge("a", "2026-01", 10_000), charge("b", "2026-02", 10_000)];
    const payments = [payment("p", 13_333, "2026-01-15T00:00:00Z")];
    const r = allocate(charges, payments);
    expect(r.balance).toBe(r.totalCharged - r.totalPaid);
  });

  it("is deterministic across re-runs (recomputable ledger)", () => {
    const charges = [charge("a", "2026-01", 10_000), charge("b", "2026-02", 10_000)];
    const payments = [
      payment("p1", 6_000, "2026-01-10T00:00:00Z"),
      payment("p2", 9_000, "2026-02-10T00:00:00Z"),
    ];
    const r1 = allocate(charges, payments);
    const r2 = allocate(charges, payments);
    expect(r1).toEqual(r2);
  });
});
