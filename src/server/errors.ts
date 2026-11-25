/**
 * Turn database / network errors into sentences a landlord can act on.
 * Never show technical messages.
 */
const PLAIN: [RegExp, string][] = [
  [/permission denied|row-level security|You don't have permission/i, "You don't have permission to do that. Ask the owner of this account."],
  [/must add up to the payment/i, "The amounts don't add up to the payment. Try again."],
  [/already been posted/i, "This payment is already matched to a tenant."],
  [/units_code_uniq/, "Some of those unit numbers already exist in this building."],
  [/buildings_name_uniq/, "You already have a building with that name."],
  [/payout_channels_uniq/, "That paybill or till number is already set up."],
  [/leases_one_active_per_unit/, "That unit already has a tenant."],
  [/duplicate key/i, "That already exists."],
  [/Failed to fetch|fetch failed|NetworkError|ECONN|ETIMEDOUT/i, "We couldn't reach the server. Check your internet and try again."],
  [/JWT|session/i, "Please sign in again."],
];

export function friendlyError(e: unknown): string {
  const raw = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  for (const [re, text] of PLAIN) if (re.test(raw)) return text;
  // Our own database messages are already written for people (plan limits, checks).
  const ours = raw.replace(/^plan_limit:\s*/, "");
  if (ours && /^[A-Z][^{}<>]{5,200}[.!?]$/.test(ours) && !/[_()]|null|violates|relation|column|syntax/i.test(ours)) return ours;
  return "Something went wrong. Please try again.";
}
