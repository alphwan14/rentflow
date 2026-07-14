/**
 * Role → capability mapping, mirroring the SQL helpers (rf_is_owner,
 * rf_is_admin, rf_can_write) in supabase/migrations. The database is
 * authoritative — these exist for good error messages and UI gating.
 *
 * 'staff' is the legacy name for caretaker-level access: same capabilities,
 * kept valid so pre-v1.1 rows never break.
 */

export type AppRole = "owner" | "admin" | "staff" | "caretaker" | "viewer";

/** Collapse legacy 'staff' onto 'caretaker'; unknown values become 'viewer'. */
export function normalizeRole(role: string | null | undefined): Exclude<AppRole, "staff"> {
  switch (role) {
    case "owner":
    case "admin":
    case "caretaker":
    case "viewer":
      return role;
    case "staff":
      return "caretaker";
    default:
      return "viewer";
  }
}

/** Create/edit/delete tenants and units, edit org settings. */
export function canManageTenants(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "owner" || r === "admin";
}

/** Record payments — everyone except read-only viewers. */
export function canRecordPayment(role: string | null | undefined): boolean {
  return normalizeRole(role) !== "viewer";
}

/** Invite/remove members, change non-owner roles, edit org name. */
export function canManageTeam(role: string | null | undefined): boolean {
  return canManageTenants(role);
}

/** Transfer ownership of the organization. */
export function canTransferOwnership(role: string | null | undefined): boolean {
  return normalizeRole(role) === "owner";
}

export function roleLabel(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "caretaker":
      return "Caretaker";
    case "viewer":
      return "Viewer";
  }
}

/** Roles an owner/admin may assign when inviting or changing a member. */
export const ASSIGNABLE_ROLES: { value: Exclude<AppRole, "owner" | "staff">; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "caretaker", label: "Caretaker" },
  { value: "viewer", label: "Viewer" },
];
