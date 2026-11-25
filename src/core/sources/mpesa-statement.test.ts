import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kes } from "../money";
import { parseCsv } from "./csv";
import { parsePayer, parseStatementCsv, parseStatementDate, parseStatementPdfText, parseStatementTable } from "./mpesa-statement";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseCsv", () => {
  it("handles quotes, commas in amounts and CRLF", () => {
    expect(parseCsv('a,"15,000.00","say ""hi"""\r\nb,2,3\r\n')).toEqual([
      ["a", "15,000.00", 'say "hi"'],
      ["b", "2", "3"],
    ]);
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["2026-11-05 08:15:22", "2026-11-05T08:15:22+03:00"],
    ["05-11-2026 08:15:22", "2026-11-05T08:15:22+03:00"],
    ["05/11/2026 8:15 PM", "2026-11-05T20:15:00+03:00"],
    ["5 Nov 2026 08:15", "2026-11-05T08:15:00+03:00"],
    ["2026/11/05", "2026-11-05T00:00:00+03:00"],
  ])("%s", (input, out) => expect(parseStatementDate(input)).toBe(out));
  it("rejects nonsense", () => expect(parseStatementDate("yesterday")).toBeNull());
});

describe("parsePayer", () => {
  it("reads phone, name and account from paybill details", () => {
    expect(parsePayer("Pay Bill from 254712345678 - JOHN KAMAU MWANGI Acc. B12")).toEqual({
      payerPhone: "254712345678",
      payerPhoneMasked: null,
      payerName: "JOHN KAMAU MWANGI",
      accountRef: "B12",
    });
  });
  it("keeps masked phones as masks", () => {
    const p = parsePayer("Funds received from - 0712***678 JOHN KAMAU");
    expect(p.payerPhone).toBeNull();
    expect(p.payerPhoneMasked).toBe("0712***678");
    expect(p.payerName).toBe("JOHN KAMAU");
  });
  it("prefers the A/C No. column and Other Party Info", () => {
    const p = parsePayer("Pay Bill Online from 2547******222 - GRACE Acc. b-21", "2547******222 - GRACE WANJIKU NJERI", "b-21");
    expect(p).toMatchObject({ payerPhoneMasked: "2547******222", payerName: "GRACE WANJIKU NJERI", accountRef: "b-21" });
  });
  it("handles business payers with no phone", () => {
    const p = parsePayer("Pay Bill from KCB BANK - SALARY ACME Acc. B13");
    expect(p.accountRef).toBe("B13");
  });
});

describe("paybill statement CSV", () => {
  const r = parseStatementCsv(fixture("paybill-statement.csv"));

  it("keeps only completed incoming payments, once each", () => {
    expect(r.payments.map((p) => p.transCode)).toEqual(["TKB3XY12ZQ", "TKB4AB34CD", "TKB5EF56GH", "TKB7MN90OP", "TKB8QR12ST"]);
  });

  it("reports what was skipped and why", () => {
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(["not_completed", "outgoing", "outgoing"]);
  });

  it("parses amounts to cents and dates to Nairobi time", () => {
    const p = r.payments[0];
    expect(p.amountCents).toBe(kes(15_000));
    expect(p.occurredAt).toBe("2026-11-01T07:58:41+03:00");
    expect(p.payerPhone).toBe("254712345678");
    expect(p.accountRef).toBe("B12");
  });

  it("detects the format and period", () => {
    expect(r.format).toBe("M-Pesa business statement");
    expect(r.periodStart).toBe("2026-11-01");
    expect(r.periodEnd).toBe("2026-11-06");
  });

  it("rejects files that are not statements", () => {
    expect(() => parseStatementCsv("name,phone\nJohn,0712345678")).toThrow(/M-Pesa statement/);
  });
});

describe("Excel rows", () => {
  it("accepts Date and number cells from spreadsheets", () => {
    const r = parseStatementTable([
      ["Receipt No.", "Completion Time", "Details", "Transaction Status", "Paid In", "Withdrawn", "A/C No."],
      ["TKE1ZZ99YY", new Date(Date.UTC(2026, 10, 3, 9, 30, 0)), "Pay Bill from 254700999888 - MARY ATIENO Acc. A2", "Completed", 12000, null, "A2"],
    ]);
    expect(r.payments[0]).toMatchObject({ amountCents: kes(12_000), occurredAt: "2026-11-03T09:30:00+03:00", accountRef: "A2" });
  });
});

describe("personal statement PDF text", () => {
  const r = parseStatementPdfText(fixture("personal-statement.txt"));

  it("finds incoming transfers, including names wrapped onto the next line", () => {
    expect(r.payments.map((p) => [p.transCode, p.amountCents, p.payerName])).toEqual([
      ["TKD1AA11BB", kes(15_000), "JOHN KAMAU"],
      ["TKD3EE33FF", kes(6_000), "MARY ATIENO"],
      ["TKD5II55JJ", kes(20_000), "SAMUEL KIPTOO"],
    ]);
    expect(r.payments[0].payerPhoneMasked).toBe("0712***678");
  });

  it("skips money sent out and failed transactions", () => {
    expect(r.skipped.map((s) => s.reason)).toEqual(["outgoing", "outgoing", "not_completed"]);
  });
});
