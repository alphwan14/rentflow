import { describe, expect, it } from "vitest";
import { backoffSeconds, isExhausted, nextAttemptAt } from "./retry";

describe("backoffSeconds", () => {
  it("follows the bounded schedule", () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(300);
    expect(backoffSeconds(3)).toBe(900);
    expect(backoffSeconds(4)).toBe(3600);
    expect(backoffSeconds(5)).toBe(10800);
    expect(backoffSeconds(6)).toBe(43200);
  });

  it("caps at the last bucket for high attempts", () => {
    expect(backoffSeconds(99)).toBe(43200);
  });

  it("clamps non-positive attempts to the first bucket", () => {
    expect(backoffSeconds(0)).toBe(60);
    expect(backoffSeconds(-5)).toBe(60);
  });
});

describe("nextAttemptAt", () => {
  it("adds the backoff to now", () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    expect(nextAttemptAt(1, now).toISOString()).toBe("2026-06-16T10:01:00.000Z");
    expect(nextAttemptAt(2, now).toISOString()).toBe("2026-06-16T10:05:00.000Z");
  });
});

describe("isExhausted", () => {
  it("is true only when attempts reach the cap", () => {
    expect(isExhausted(5, 6)).toBe(false);
    expect(isExhausted(6, 6)).toBe(true);
    expect(isExhausted(7, 6)).toBe(true);
  });
});
