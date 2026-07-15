import { describe, expect, it } from "vitest";
import {
  tokensMatch,
  parseIpAllowlist,
  ipAllowed,
  clientIp,
  describeToken,
  candidateForms,
  diagnoseMismatch,
  sha12,
} from "./callback-auth";

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

describe("describeToken (never exposes the value)", () => {
  it("fingerprints without leaking", () => {
    const d = describeToken("abc+/= ");
    expect(d).toEqual({
      exists: true,
      length: 7,
      sha12: sha12("abc+/= "),
      containsPlus: true,
      containsSlash: true,
      containsEquals: true,
      leadingWhitespace: false,
      trailingWhitespace: true,
      urlDecodedChangesValue: false,
    });
    expect(JSON.stringify(d)).not.toContain("abc+/=");
  });
  it("flags %-encoding that decodes to something else", () => {
    expect(describeToken("a%2Fb").urlDecodedChangesValue).toBe(true);
    expect(describeToken("plain-token").urlDecodedChangesValue).toBe(false);
  });
  it("handles missing tokens", () => {
    expect(describeToken(undefined).exists).toBe(false);
    expect(describeToken(null).length).toBe(0);
  });
});

describe("candidateForms", () => {
  it("clean token yields just the raw form", () => {
    expect(candidateForms("cleanToken123")).toEqual([{ form: "raw", value: "cleanToken123" }]);
  });
  it("recovers whitespace, encoding and trailing-slash mangling", () => {
    const forms = candidateForms(" tok%2Fen/ ");
    expect(forms.map((f) => f.form)).toContain("trimmed");
    expect(forms.some((f) => f.value === "tok/en/")).toBe(true); // trimmed+decoded
  });
  it("a url-encoded correct token matches after decoding", () => {
    const expected = "with_underscore-and-dash";
    const encoded = encodeURIComponent(expected);
    const hit = candidateForms(encoded).find((f) => tokensMatch(f.value, expected));
    expect(hit?.form).toBe("raw"); // no unsafe chars -> encoding is identity
  });
});

describe("diagnoseMismatch", () => {
  const expected = "e".repeat(48);
  it("distinguishes every failure mode", () => {
    expect(diagnoseMismatch(undefined, undefined)).toBe("env_token_missing");
    expect(diagnoseMismatch(undefined, expected)).toBe("no_token_supplied");
    expect(diagnoseMismatch(" tok ", expected)).toBe("whitespace_around_token");
    expect(diagnoseMismatch("a%2Fb".repeat(12), expected)).toBe("url_encoding_changed_value");
    expect(diagnoseMismatch("short", expected)).toBe("length_mismatch_received_5_expected_48");
    expect(diagnoseMismatch("x".repeat(48), expected)).toBe(
      "same_length_hashes_differ_wrong_token_configured"
    );
  });
});
