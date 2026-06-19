import { describe, expect, it } from "vitest";
import {
  formatKes,
  formatReceiptSms,
  gsm7Length,
  isGsm7,
  smsSegments,
  type ReceiptSnapshot,
} from "./receipt-formatter";

const snapshot: ReceiptSnapshot = {
  receipt_no: "RCP-2026-00014",
  tenant_name: "John Mwangi",
  unit: "A2",
  amount_cents: 1_500_000, // KES 15,000
  method: "mpesa",
  paid_at: "2026-06-16T08:30:00.000Z",
  balance_cents: 0,
  arrears_cents: 0,
  credit_cents: 0,
  covered_until: "August 2026",
};

describe("formatKes", () => {
  it("formats whole shillings with separators", () => {
    expect(formatKes(1_500_000)).toBe("KES 15,000");
    expect(formatKes(0)).toBe("KES 0");
    expect(formatKes(100)).toBe("KES 1");
  });
});

describe("formatReceiptSms", () => {
  it("renders the spec receipt layout", () => {
    const body = formatReceiptSms(snapshot);
    expect(body).toContain("RENTFLOW RECEIPT");
    expect(body).toContain("Payment received: KES 15,000");
    expect(body).toContain("Room: A2");
    expect(body).toContain("Tenant: John Mwangi");
    expect(body).toContain("Receipt No: RCP-2026-00014");
    expect(body).toContain("Date: 16 Jun 2026");
    expect(body).toContain("Balance: KES 0");
    expect(body).toContain("Covered Until: August 2026");
    expect(body.trimEnd().endsWith("Thank you.")).toBe(true);
  });

  it("omits room and covered-until when absent", () => {
    const body = formatReceiptSms({ ...snapshot, unit: null, covered_until: null });
    expect(body).not.toContain("Room:");
    expect(body).not.toContain("Covered Until:");
  });

  it("stays GSM-7 and within a small number of segments", () => {
    const body = formatReceiptSms(snapshot);
    expect(isGsm7(body)).toBe(true);
    expect(smsSegments(body)).toBeLessThanOrEqual(2);
  });
});

describe("GSM-7 segmentation", () => {
  it("detects non-GSM characters (forces UCS-2)", () => {
    expect(isGsm7("Plain ASCII text")).toBe(true);
    expect(isGsm7("emoji 😀")).toBe(false);
  });

  it("counts extended chars as two", () => {
    expect(gsm7Length("[")).toBe(2); // '[' is in the extended set
    expect(gsm7Length("a")).toBe(1);
  });

  it("segments by GSM-7 boundaries", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
  });

  it("segments by UCS-2 boundaries when non-GSM present", () => {
    // Each emoji is 2 UTF-16 code units: 35 -> 70 units (1 seg), 40 -> 80 (2 segs).
    expect(smsSegments("😀".repeat(35))).toBe(1);
    expect(smsSegments("😀".repeat(40))).toBe(2);
  });
});
