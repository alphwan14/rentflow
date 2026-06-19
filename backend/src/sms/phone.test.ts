import { describe, expect, it } from "vitest";
import { normalizeKenyanPhone } from "./phone";

describe("normalizeKenyanPhone", () => {
  it("normalizes the three common formats to identical E.164", () => {
    expect(normalizeKenyanPhone("0756528219")).toEqual({ e164: "+254756528219", recognized: true });
    expect(normalizeKenyanPhone("254756528219")).toEqual({ e164: "+254756528219", recognized: true });
    expect(normalizeKenyanPhone("+254756528219")).toEqual({ e164: "+254756528219", recognized: true });
  });

  it("strips spaces, hyphens and parentheses", () => {
    expect(normalizeKenyanPhone("0712 345 678").e164).toBe("+254712345678");
    expect(normalizeKenyanPhone("0712-345-678").e164).toBe("+254712345678");
    expect(normalizeKenyanPhone(" +254 712 345 678 ").e164).toBe("+254712345678");
  });

  it("handles 01x (fixed/MVNO) ranges", () => {
    expect(normalizeKenyanPhone("0110000000")).toEqual({ e164: "+254110000000", recognized: true });
  });

  it("accepts the 9-digit subscriber number with no prefix", () => {
    expect(normalizeKenyanPhone("756528219")).toEqual({ e164: "+254756528219", recognized: true });
  });

  it("flags unrecognizable input instead of guessing", () => {
    const r = normalizeKenyanPhone("12345");
    expect(r.recognized).toBe(false);
    expect(r.e164).toBe("12345");
  });
});
