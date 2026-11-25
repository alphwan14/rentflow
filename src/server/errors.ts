/** Turn Supabase / Postgres errors into sentences a landlord can act on. */
export function friendlyError(e: unknown): string {
  const raw =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "Something went wrong");
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "42501" || /permission denied|row-level security/i.test(raw)) {
    return raw.startsWith("permission denied") || /row-level/.test(raw) ? "You don't have permission to do that." : raw;
  }
  if (code === "23505" || /duplicate key/i.test(raw)) {
    if (/units_code_uniq/.test(raw)) return "Some of those unit codes already exist in this building.";
    if (/buildings_name_uniq/.test(raw)) return "You already have a building with that name.";
    if (/payout_channels_uniq/.test(raw)) return "That paybill / till is already set up.";
    return "That already exists.";
  }
  return raw.replace(/^plan_limit:\s*/, "");
}

export function isPlanLimit(e: unknown): boolean {
  return /plan_limit/.test(typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "");
}
