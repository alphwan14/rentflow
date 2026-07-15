import { describe, expect, it } from "vitest";
import { tokensMatch, parseIpAllowlist, ipAllowed, clientIp } from "./callback-auth";

describe("tokensMatch", () => {
  it("accepts the exact token", () => {
    expect(tokensMatch("secret-123", "secret-123")).toBe(true);
  });
  it("rejects wrong, empty and missing tokens", () => {
    expect(tokensMatch("secret-124", "secret-123")).toBe(false);
    expect(tokensMatch("", "secret-123")).toBe(false);
    expect(tokensMatch(null, "secret-123")).toBe(false);
    expect(tokensMatch(undefined, "secret-123")).toBe(false);
  });
  it("rejects tokens of different length without throwing", () => {
    expect(tokensMatch("short", "a-much-longer-expected-token")).toBe(false);
  });
});

describe("parseIpAllowlist", () => {
  it("splits and trims", () => {
    expect(parseIpAllowlist(" 1.2.3.4 , 196.216. ")).toEqual(["1.2.3.4", "196.216."]);
  });
  it("empty/undefined -> disabled", () => {
    expect(parseIpAllowlist(undefined)).toEqual([]);
    expect(parseIpAllowlist("")).toEqual([]);
  });
});

describe("ipAllowed", () => {
  const list = ["196.216.167.9", "41.90."];
  it("empty allowlist allows everything (check disabled)", () => {
    expect(ipAllowed("8.8.8.8", [])).toBe(true);
  });
  it("exact match", () => {
    expect(ipAllowed("196.216.167.9", list)).toBe(true);
    expect(ipAllowed("196.216.167.10", list)).toBe(false);
  });
  it("prefix match", () => {
    expect(ipAllowed("41.90.12.7", list)).toBe(true);
    expect(ipAllowed("41.900.0.1", list)).toBe(false); // "41.90." prefix requires the dot
  });
  it("ipv6-mapped ipv4 normalizes", () => {
    expect(ipAllowed("::ffff:196.216.167.9", list)).toBe(true);
  });
  it("missing ip is rejected when a list is configured", () => {
    expect(ipAllowed(undefined, list)).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, "10.0.0.9")).toBe("1.2.3.4");
  });
  it("falls back to the socket address", () => {
    expect(clientIp({}, "10.0.0.9")).toBe("10.0.0.9");
  });
});
