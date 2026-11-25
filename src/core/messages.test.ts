import { describe, expect, it } from "vitest";
import { kes } from "./money";
import { firstName, inviteMessage, receiptSms, reminderSms } from "./messages";

describe("receiptSms", () => {
  const base = { tenantName: "JANE WANJIRU", amountCents: kes(15_000), unitCode: "B12", buildingName: "Sunrise Apartments", period: "2026-03-01" };
  it("says the month is fully paid", () => {
    expect(receiptSms({ ...base, balanceAfterCents: 0 })).toBe(
      "RentFlow: Received KES 15,000 from Jane for B12, Sunrise Apartments. March rent is fully paid. Thank you.",
    );
  });
  it("says what is still unpaid", () => {
    expect(receiptSms({ ...base, amountCents: kes(10_000), balanceAfterCents: kes(5_000) })).toContain("KES 5,000 is still unpaid.");
  });
  it("says when they are ahead", () => {
    expect(receiptSms({ ...base, balanceAfterCents: -kes(15_000) })).toContain("you are KES 15,000 ahead");
  });
  it("fits in two SMS", () => {
    expect(receiptSms({ ...base, balanceAfterCents: 0 }).length).toBeLessThanOrEqual(306);
  });
});

describe("reminderSms", () => {
  const base = { tenantName: "Jane Wanjiru", unitCode: "B12", period: "2026-03-01", dueDate: "2026-03-05", rentCents: kes(15_000), payTo: { kind: "paybill" as const, number: "123456" } };
  it("before the due date", () => {
    expect(reminderSms({ ...base, today: "2026-03-02", owedCents: kes(15_000) })).toBe(
      "Hi Jane, March rent of KES 15,000 for B12 is due on 5 Mar. Pay to Paybill 123456, account B12.",
    );
  });
  it("after the due date, with older debt", () => {
    expect(reminderSms({ ...base, today: "2026-03-10", owedCents: kes(27_000) })).toBe(
      "Hi Jane, you owe KES 27,000 for B12. March rent was due on 5 Mar. Pay to Paybill 123456, account B12.",
    );
  });
  it("till numbers have no account", () => {
    expect(reminderSms({ ...base, today: "2026-03-02", owedCents: kes(15_000), payTo: { kind: "till", number: "998877" } })).toMatch(/Pay to Till 998877\.$/);
  });
});

describe("helpers", () => {
  it("first names", () => {
    expect(firstName("  MARY atieno ")).toBe("Mary");
  });
  it("invite message", () => {
    expect(inviteMessage({ orgName: "Sunrise", role: "caretaker", link: "https://x/join/abc" })).toContain("https://x/join/abc");
  });
});
