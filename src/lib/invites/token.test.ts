import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, looksLikeInviteToken } from "./token";

describe("generateInviteToken", () => {
  it("produces url-safe tokens of the expected length", () => {
    for (let i = 0; i < 50; i++) {
      const t = generateInviteToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
      expect(looksLikeInviteToken(t)).toBe(true);
    }
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateInviteToken()));
    expect(seen.size).toBe(1000);
  });
});

describe("hashInviteToken", () => {
  it("is deterministic", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
  });

  it("is a 64-char hex sha256, different from the raw token", () => {
    const t = generateInviteToken();
    const h = hashInviteToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
  });

  it("differs for different tokens", () => {
    expect(hashInviteToken("a")).not.toBe(hashInviteToken("b"));
  });
});

describe("looksLikeInviteToken", () => {
  it("rejects garbage", () => {
    expect(looksLikeInviteToken("")).toBe(false);
    expect(looksLikeInviteToken("short")).toBe(false);
    expect(looksLikeInviteToken("has spaces ".repeat(5))).toBe(false);
    expect(looksLikeInviteToken("<script>" + "a".repeat(40))).toBe(false);
  });
});
