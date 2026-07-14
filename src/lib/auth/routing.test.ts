import { describe, expect, it } from "vitest";
import { decidePostAuthPath, isSafeInternalPath } from "./routing";

describe("isSafeInternalPath", () => {
  it("accepts same-origin paths", () => {
    expect(isSafeInternalPath("/dashboard")).toBe(true);
    expect(isSafeInternalPath("/invite/abc123")).toBe(true);
    expect(isSafeInternalPath("/tenants/1?x=1")).toBe(true);
  });

  it("rejects open-redirect vectors", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.com/x")).toBe(false);
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
    expect(isSafeInternalPath("dashboard")).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
  });
});

describe("decidePostAuthPath", () => {
  it("a safe next path wins over everything", () => {
    expect(
      decidePostAuthPath({ hasProfile: true, hasPendingInvite: true, next: "/invite/tok" })
    ).toBe("/invite/tok");
  });

  it("unsafe next is ignored", () => {
    expect(
      decidePostAuthPath({ hasProfile: true, hasPendingInvite: false, next: "//evil.com" })
    ).toBe("/dashboard");
  });

  it("profile -> dashboard", () => {
    expect(decidePostAuthPath({ hasProfile: true, hasPendingInvite: false })).toBe("/dashboard");
  });

  it("no profile + pending invite -> onboarding with join banner", () => {
    expect(decidePostAuthPath({ hasProfile: false, hasPendingInvite: true })).toBe(
      "/onboarding?invite=1"
    );
  });

  it("no profile, no invite -> onboarding", () => {
    expect(decidePostAuthPath({ hasProfile: false, hasPendingInvite: false })).toBe("/onboarding");
  });
});
