import { describe, expect, it } from "vitest";
import { formatKES, formatKESCompact, kes, parseCents } from "./money";
import { extractPhones, formatPhone, normalizePhone, parsePhoneMask, phoneMatchesMask } from "./phone";
import { addMonths, dueDateFor, monthsBetween, todayNairobi } from "./period";

describe("parseCents", () => {
  it.each([
    ["15,000", 1_500_000],
    ["15000.00", 1_500_000],
    ["KES 15,000.50", 1_500_050],
    ["Ksh 7,500", 750_000],
    ["-1,000.00", -100_000],
    ["(2,500.00)", -250_000],
    ["0.1", 10],
    [" 184 000 ", 18_400_000],
  ])("%s → %i cents", (input, cents) => {
    expect(parseCents(input)).toBe(cents);
  });

  it("handles spreadsheet numbers without float drift", () => {
    expect(parseCents(0.1 + 0.2)).toBe(30);
    expect(parseCents(15000)).toBe(1_500_000);
  });

  it("returns null for blanks and rejects garbage", () => {
    expect(parseCents("")).toBeNull();
    expect(parseCents(null)).toBeNull();
    expect(() => parseCents("abc")).toThrow();
    expect(() => parseCents("1.234")).toThrow();
  });
});

describe("formatKES", () => {
  it("formats whole shillings with grouping", () => {
    expect(formatKES(kes(184_000))).toBe("KES 184,000");
    expect(formatKES(0)).toBe("KES 0");
  });
  it("shows cents only when present", () => {
    expect(formatKES(125_050)).toBe("KES 1,250.50");
  });
  it("marks credit with a minus sign", () => {
    expect(formatKES(-500_000)).toBe("−KES 5,000");
  });
  it("compacts for axes", () => {
    expect(formatKESCompact(kes(184_000))).toBe("184K");
    expect(formatKESCompact(kes(1_250_000))).toBe("1.3M");
  });
});

describe("phones", () => {
  it.each([
    ["0712345678", "254712345678"],
    ["+254 712 345 678", "254712345678"],
    ["254712345678", "254712345678"],
    ["712345678", "254712345678"],
    ["0110 123 456", "254110123456"],
    ["2540712345678", "254712345678"],
  ])("normalises %s", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it("rejects landlines, short numbers and masks", () => {
    expect(normalizePhone("020 222 3333")).toBeNull();
    expect(normalizePhone("07123")).toBeNull();
    expect(normalizePhone("2547******678")).toBeNull();
  });

  it("parses masked numbers from statements", () => {
    const m = parsePhoneMask("2547******678")!;
    expect(m).toEqual({ prefix: "2547", suffix: "678", length: 12 });
    expect(phoneMatchesMask("254712345678", m)).toBe(true);
    expect(phoneMatchesMask("254712345679", m)).toBe(false);
    expect(parsePhoneMask("0712***678")).toEqual({ prefix: "254712", suffix: "678", length: 12 });
  });

  it("formats and extracts", () => {
    expect(formatPhone("254712345678")).toBe("0712 345 678");
    expect(extractPhones("Call 0712 345 678 or +254722000111")).toEqual(["254712345678", "254722000111"]);
  });
});

describe("periods", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });
  it("clamps due day to month length", () => {
    expect(dueDateFor("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueDateFor("2026-10-01", 5)).toBe("2026-10-05");
  });
  it("lists months inclusive", () => {
    expect(monthsBetween("2026-08-15", "2026-10-02")).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });
  it("uses Nairobi time", () => {
    expect(todayNairobi(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01");
  });
});
