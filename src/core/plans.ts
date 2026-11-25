/**
 * Plans and feature gating (billing comes later). Mirrored in SQL by
 * _assert_unit_capacity / _assert_building_capacity / create_invite.
 *
 * Automatic matching is never gated: every plan matches payments
 * automatically. "Live matching" means payments arriving from Daraja / KCB
 * the moment they happen, instead of from uploaded statements.
 */
export type Plan = "free" | "growth" | "pro";

export type Feature =
  | "statement_matching"
  | "sms_receipts"
  | "manual_reminders"
  | "live_matching"
  | "auto_reminders"
  | "caretakers"
  | "water_billing"
  | "late_fees"
  | "deposits"
  | "multiple_buildings"
  | "unlimited_caretakers"
  | "whatsapp"
  | "owner_statements"
  | "tax_summary"
  | "expenses";

const FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  free: new Set<Feature>(["statement_matching", "sms_receipts", "manual_reminders"]),
  growth: new Set<Feature>([
    "statement_matching", "sms_receipts", "manual_reminders", "live_matching", "auto_reminders",
    "caretakers", "water_billing", "late_fees", "deposits",
  ]),
  pro: new Set<Feature>([
    "statement_matching", "sms_receipts", "manual_reminders", "live_matching", "auto_reminders",
    "caretakers", "water_billing", "late_fees", "deposits", "multiple_buildings", "unlimited_caretakers",
    "whatsapp", "owner_statements", "tax_summary", "expenses",
  ]),
};

export const PLAN_LABEL: Record<Plan, string> = { free: "Free", growth: "Growth", pro: "Pro" };

export const UNIT_LIMIT: Record<Plan, number | null> = { free: 10, growth: null, pro: null };

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return FEATURES[plan].has(feature);
}

/** The cheapest plan that includes a feature, for upgrade prompts. */
export function planFor(feature: Feature): Plan {
  return (["free", "growth", "pro"] as Plan[]).find((p) => FEATURES[p].has(feature))!;
}
