import { describe, expect, it } from "vitest";
import {
  normalizeRole,
  canManageTenants,
  canRecordPayment,
  canManageTeam,
  canTransferOwnership,
  roleLabel,
} from "./permissions";

describe("normalizeRole", () => {
  it("keeps the four canonical roles", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("caretaker")).toBe("caretaker");
    expect(normalizeRole("viewer")).toBe("viewer");
  });

  it("maps legacy staff to caretaker", () => {
    expect(normalizeRole("staff")).toBe("caretaker");
  });

  it("fails closed: unknown/missing roles become viewer", () => {
    expect(normalizeRole(undefined)).toBe("viewer");
    expect(normalizeRole(null)).toBe("viewer");
    expect(normalizeRole("superuser")).toBe("viewer");
    expect(normalizeRole("")).toBe("viewer");
  });
});

describe("permission matrix", () => {
  const cases: Array<{
    role: string;
    tenants: boolean;
    payment: boolean;
    team: boolean;
    transfer: boolean;
  }> = [
    { role: "owner", tenants: true, payment: true, team: true, transfer: true },
    { role: "admin", tenants: true, payment: true, team: true, transfer: false },
    { role: "caretaker", tenants: false, payment: true, team: false, transfer: false },
    { role: "staff", tenants: false, payment: true, team: false, transfer: false },
    { role: "viewer", tenants: false, payment: false, team: false, transfer: false },
  ];

  for (const c of cases) {
    it(`${c.role}: tenants=${c.tenants} payment=${c.payment} team=${c.team} transfer=${c.transfer}`, () => {
      expect(canManageTenants(c.role)).toBe(c.tenants);
      expect(canRecordPayment(c.role)).toBe(c.payment);
      expect(canManageTeam(c.role)).toBe(c.team);
      expect(canTransferOwnership(c.role)).toBe(c.transfer);
    });
  }
});

describe("roleLabel", () => {
  it("labels legacy staff as Caretaker", () => {
    expect(roleLabel("staff")).toBe("Caretaker");
    expect(roleLabel("owner")).toBe("Owner");
  });
});
