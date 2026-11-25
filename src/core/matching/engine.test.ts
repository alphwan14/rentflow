import { describe, expect, it } from "vitest";
import { kes } from "../money";
import { matchBatch, matchPayment, rulesToLearn, splitAcrossLeases } from "./engine";
import type { IncomingPayment, LeaseCandidate, MatchContext } from "./types";

/**
 * Fixture: "Kasarani Heights", a typical Nairobi walk-up. Balances are what
 * each tenant owes for November (rent due on the 5th).
 */
const L = (
  leaseId: string,
  unitCode: string,
  tenantId: string,
  tenantName: string,
  rent: number,
  phones: string[],
  extra: Partial<LeaseCandidate> = {},
): LeaseCandidate => ({
  leaseId,
  unitCode,
  tenantId,
  tenantName,
  buildingId: "kasarani",
  rentCents: kes(rent),
  balanceCents: kes(rent),
  oldestUnpaidDue: "2026-11-05",
  phones,
  ...extra,
});

const leases: LeaseCandidate[] = [
  L("l-b12", "B12", "t-john", "John Kamau Mwangi", 15_000, ["254712345678"]),
  L("l-b21", "B21", "t-grace", "Grace Wanjiku Njeri", 15_000, ["254722111222"]),
  L("l-b13", "B13", "t-faith", "Faith Muthoni", 15_000, ["254799888777"]),
  L("l-a1", "A1", "t-peter", "Peter Otieno Ochieng", 12_000, ["254733444555", "254110222333"]),
  L("l-a2", "A2", "t-mary", "Mary Atieno", 12_000, ["254700999888"]),
  // Samuel rents a house and the shop downstairs.
  L("l-a3", "A3", "t-sam", "Samuel Kiptoo Langat", 12_000, ["254711000111"], { oldestUnpaidDue: "2026-10-05", balanceCents: kes(24_000) }),
  L("l-a4", "A4", "t-sam", "Samuel Kiptoo Langat", 8_000, ["254711000111"]),
];

const ctx: MatchContext = { leases, rules: [] };

let seq = 0;
const pay = (p: Partial<IncomingPayment> & { amount: number }): IncomingPayment => ({
  id: `e${++seq}`,
  transCode: `TKB${String(seq).padStart(7, "0")}`,
  amountCents: kes(p.amount),
  occurredAt: p.occurredAt ?? "2026-11-05T08:15:00+03:00",
  payerPhone: p.payerPhone ?? null,
  payerPhoneMasked: p.payerPhoneMasked ?? null,
  payerName: p.payerName ?? null,
  accountRef: p.accountRef ?? null,
});

describe("matchPayment: the happy path", () => {
  it("correct unit code from the tenant's own phone posts automatically", () => {
    const r = matchPayment(pay({ amount: 15_000, accountRef: "B12", payerPhone: "254712345678", payerName: "JOHN KAMAU MWANGI" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
    expect(r.confidence).toBeGreaterThan(0.99);
    expect(r.allocations).toEqual([{ leaseId: "l-b12", amountCents: kes(15_000) }]);
  });

  it.each(["b12", "B-12", "HSE B 12", "House No. B12", "B12 NOV", "b12nov", "B12 rent", "B012", "Unit B12 2026"])(
    "messy account reference %j still resolves to B12",
    (accountRef) => {
      const r = matchPayment(pay({ amount: 15_000, accountRef, payerName: "ESTHER NJOKI" }), ctx);
      expect(r.decision).toBe("auto");
      expect(r.best?.leaseIds).toEqual(["l-b12"]);
    },
  );
});

describe("matchPayment: who paid", () => {
  it("a relative paying with the right unit code is matched by the code", () => {
    const r = matchPayment(
      pay({ amount: 15_000, accountRef: "B12", payerPhone: "254790123456", payerName: "ESTHER NJOKI KAMAU" }),
      ctx,
    );
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("an employer paying without a code is never auto-posted", () => {
    const r = matchPayment(pay({ amount: 15_000, accountRef: "", payerPhone: "254202000000", payerName: "ACME LOGISTICS LTD" }), ctx);
    expect(r.decision).not.toBe("auto");
  });

  it("a known phone with no account reference posts automatically", () => {
    const r = matchPayment(pay({ amount: 15_000, payerPhone: "0712345678", payerName: "JOHN KAMAU" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("the tenant's second phone counts too", () => {
    const r = matchPayment(pay({ amount: 12_000, payerPhone: "254110222333", payerName: "PETER OTIENO" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-a1"]);
  });

  it("a phone learned from an earlier confirmation posts automatically", () => {
    const learned: MatchContext = { leases, rules: [{ kind: "phone", pattern: "254790123456", tenantId: "t-mary" }] };
    const r = matchPayment(pay({ amount: 12_000, payerPhone: "254790123456", payerName: "KEVIN OMONDI" }), learned);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-a2"]);
    expect(r.best?.reasons[0].signal).toBe("phone_rule");
  });

  it("the tenant's phone number typed as the account reference", () => {
    const r = matchPayment(pay({ amount: 12_000, accountRef: "0700999888", payerPhone: "254701555666" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-a2"]);
  });
});

describe("matchPayment: wrong, missing or misspelled codes", () => {
  it("wrong code from a known phone goes to the inbox, guessing the phone owner", () => {
    // John (B12) typed B21, which is Grace's unit.
    const r = matchPayment(pay({ amount: 15_000, accountRef: "B21", payerPhone: "254712345678", payerName: "JOHN KAMAU MWANGI" }), ctx);
    expect(r.decision).toBe("suggest");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
    expect(r.candidates.map((c) => c.leaseIds[0])).toContain("l-b21");
  });

  it("look-alike characters: BI2 is B12", () => {
    const r = matchPayment(pay({ amount: 15_000, accountRef: "BI2", payerName: "JOHN KAMAU" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("flipped code: 12B is B12", () => {
    const r = matchPayment(pay({ amount: 15_000, accountRef: "12B", payerPhone: "254712345678" }), ctx);
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
    expect(r.decision).toBe("auto");
  });

  it("a code that matches nothing falls back to phone and name", () => {
    const r = matchPayment(pay({ amount: 12_000, accountRef: "Z99", payerPhone: "254733444555", payerName: "PETER OTIENO OCHIENG" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-a1"]);
  });

  it("a misspelled name alone is a suggestion, not a post", () => {
    const r = matchPayment(pay({ amount: 15_000, payerPhone: "254745000000", payerName: "GRACE WANJKU NJERI" }), ctx);
    expect(r.decision).toBe("suggest");
    expect(r.best?.leaseIds).toEqual(["l-b21"]);
  });

  it("a common first name alone is weak evidence", () => {
    const r = matchPayment(pay({ amount: 3_700, payerPhone: "254745000000", payerName: "JOHN" }), ctx);
    expect(r.decision).not.toBe("auto");
    expect(r.confidence).toBeLessThan(0.25);
  });

  it("the same unit code in two buildings is ambiguous", () => {
    const two: MatchContext = {
      leases: [...leases, L("l-b12-umoja", "B12", "t-ann", "Ann Chebet", 9_000, ["254768000000"], { buildingId: "umoja" })],
      rules: [],
    };
    const r = matchPayment(pay({ amount: 10_000, accountRef: "B12" }), two);
    expect(r.decision).toBe("suggest");
    expect(r.candidates).toHaveLength(2);
  });
});

describe("matchPayment: amounts", () => {
  it("one payment covering two units is split between them", () => {
    const r = matchPayment(pay({ amount: 32_000, accountRef: "A3 & A4", payerPhone: "254711000111" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds.sort()).toEqual(["l-a3", "l-a4"]);
    // A3 owes October too (24,000), so it is cleared first; A4 gets the rest.
    expect(r.allocations).toEqual([
      { leaseId: "l-a3", amountCents: kes(24_000) },
      { leaseId: "l-a4", amountCents: kes(8_000) },
    ]);
  });

  it("B12/13 means B12 and B13", () => {
    const r = matchPayment(pay({ amount: 30_000, accountRef: "B12/13" }), ctx);
    expect(r.best?.leaseIds.sort()).toEqual(["l-b12", "l-b13"]);
    expect(r.decision).toBe("auto");
  });

  it("a tenant with two units paying from their phone without a code covers both", () => {
    const r = matchPayment(pay({ amount: 32_000, payerPhone: "254711000111" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.allocations.reduce((s, a) => s + a.amountCents, 0)).toBe(kes(32_000));
    expect(r.allocations).toHaveLength(2);
  });

  it("naming one of two units narrows to that unit", () => {
    const r = matchPayment(pay({ amount: 8_000, accountRef: "A4", payerPhone: "254711000111" }), ctx);
    expect(r.best?.leaseIds).toEqual(["l-a4"]);
    expect(r.allocations).toEqual([{ leaseId: "l-a4", amountCents: kes(8_000) }]);
  });

  it("rent paid in parts: a partial payment is still matched and posted", () => {
    const r = matchPayment(pay({ amount: 5_000, payerPhone: "254712345678" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.allocations).toEqual([{ leaseId: "l-b12", amountCents: kes(5_000) }]);
  });

  it("overpayment is posted in full (the ledger turns it into credit)", () => {
    const r = matchPayment(pay({ amount: 45_000, accountRef: "B12", payerPhone: "254712345678" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.allocations).toEqual([{ leaseId: "l-b12", amountCents: kes(45_000) }]);
  });

  it("an unknown number paying an exact rent amount is suggested, never posted", () => {
    // Only A4 has 8,000 rent.
    const r = matchPayment(pay({ amount: 8_000, payerPhone: "254755123123", payerName: "BRIAN MUTUA" }), ctx);
    expect(r.decision).toBe("suggest");
    expect(r.best?.leaseIds).toEqual(["l-a4"]);
    expect(r.best?.reasons.map((x) => x.signal)).toEqual(["amount"]);
  });

  it("an exact rent amount shared by several units is not guessed confidently", () => {
    const r = matchPayment(pay({ amount: 15_000, payerPhone: "254755123123", payerName: "BRIAN MUTUA" }), ctx);
    expect(r.decision).not.toBe("auto");
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("matchPayment: masked numbers on statements", () => {
  it("masked phone plus matching name is enough", () => {
    const r = matchPayment(pay({ amount: 15_000, payerPhoneMasked: "2547******678", payerName: "JOHN KAMAU" }), ctx);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("masked phone alone is only a suggestion", () => {
    const r = matchPayment(pay({ amount: 3_000, payerPhoneMasked: "0712***678" }), ctx);
    expect(r.decision).toBe("suggest");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("a learned name posts when the phone is hidden", () => {
    const learned: MatchContext = { leases, rules: [{ kind: "name", pattern: "WILLIAM OCHIENG", tenantId: "t-peter" }] };
    const r = matchPayment(pay({ amount: 12_000, payerPhoneMasked: "2547******000", payerName: "William Ochieng" }), learned);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-a1"]);
  });
});

describe("matchPayment: past tenants", () => {
  // Kevin lived in B12 before John and moved out owing 8,000.
  const past = L("l-b12-old", "B12", "t-kevin", "Kevin Kiprono Rotich", 15_000, ["254722555666"], { movedOut: true, balanceCents: kes(8_000), oldestUnpaidDue: "2026-08-05" });
  const withPast: MatchContext = { leases: [...leases, past], rules: [] };

  it("a past tenant paying from their phone is matched to their old debt", () => {
    const r = matchPayment(pay({ amount: 8_000, payerPhone: "254722555666", payerName: "KEVIN ROTICH" }), withPast);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12-old"]);
    expect(r.best?.label).toContain("moved out");
  });

  it("the old unit number goes to whoever lives there now", () => {
    const r = matchPayment(pay({ amount: 15_000, accountRef: "B12" }), withPast);
    expect(r.decision).toBe("auto");
    expect(r.best?.leaseIds).toEqual(["l-b12"]);
  });

  it("an exact amount alone never points at a past tenant", () => {
    const r = matchPayment(pay({ amount: 8_000, payerPhone: "254755123123" }), withPast);
    expect(r.best?.leaseIds).not.toContain("l-b12-old");
  });
});

describe("matchBatch", () => {
  it("processes in time order and reduces balances as it posts", () => {
    const a = pay({ amount: 15_000, accountRef: "B12", payerPhone: "254712345678", occurredAt: "2026-11-02T09:00:00+03:00" });
    const b = pay({ amount: 15_000, payerPhone: "254745000000", payerName: "JOHN KAMAU MWANGI", occurredAt: "2026-11-20T09:00:00+03:00" });
    const out = matchBatch([b, a], ctx);
    expect(out.get(a.id)?.decision).toBe("auto");
    // After a, B12 owes nothing, so b no longer gets "exact balance" support.
    expect(out.get(b.id)?.best?.reasons.find((r) => r.signal === "amount")?.detail ?? "").not.toMatch(/balance due/);
  });
});

describe("rulesToLearn", () => {
  it("learns a relative's phone, not the tenant's own", () => {
    expect(rulesToLearn(pay({ amount: 1, payerPhone: "254790123456" }), "t-mary", ctx)).toEqual([
      { kind: "phone", pattern: "254790123456", tenantId: "t-mary" },
    ]);
    expect(rulesToLearn(pay({ amount: 1, payerPhone: "254700999888" }), "t-mary", ctx)).toEqual([]);
  });

  it("learns full names only when the phone is masked", () => {
    expect(rulesToLearn(pay({ amount: 1, payerPhoneMasked: "2547******000", payerName: "William Ochieng" }), "t-peter", ctx)).toEqual([
      { kind: "name", pattern: "WILLIAM OCHIENG", tenantId: "t-peter" },
    ]);
  });

  it("learns free-text references but never noise words", () => {
    expect(rulesToLearn(pay({ amount: 1, accountRef: "Mama Ben" }), "t-mary", ctx)).toContainEqual({
      kind: "account_ref",
      pattern: "MAMA BEN",
      tenantId: "t-mary",
    });
    expect(rulesToLearn(pay({ amount: 1, accountRef: "RENT" }), "t-mary", ctx)).toEqual([]);
    expect(rulesToLearn(pay({ amount: 1, accountRef: "B12" }), "t-john", ctx)).toEqual([]);
  });
});

describe("splitAcrossLeases", () => {
  it("clears the oldest debt first and leaves extra on the first lease", () => {
    const out = splitAcrossLeases(kes(40_000), [leases[6], leases[5]]);
    expect(out).toEqual([
      { leaseId: "l-a4", amountCents: kes(16_000) },
      { leaseId: "l-a3", amountCents: kes(24_000) },
    ]);
  });
});
