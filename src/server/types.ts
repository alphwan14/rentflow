/** Row shapes returned by Supabase (bigint cents arrive as JSON numbers). */

export interface LeaseOverview {
  lease_id: string;
  org_id: string;
  status: "active" | "ended";
  start_date: string;
  end_date: string | null;
  rent_cents: number;
  deposit_cents: number;
  due_day: number;
  unit_id: string;
  unit_code: string;
  code_key: string;
  building_id: string;
  building_name: string;
  tenant_id: string;
  tenant_name: string;
  balance_cents: number;
  credits_cents: number;
  oldest_unpaid_due: string | null;
  last_paid_on: string | null;
  paid_this_month_cents: number;
  phones: string[];
}

export type EventStatus = "pending" | "matched" | "suggested" | "unmatched" | "ignored";

export interface PaymentEventRow {
  id: string;
  org_id: string;
  source: string;
  trans_code: string;
  amount_cents: number;
  occurred_at: string;
  payer_phone: string | null;
  payer_phone_masked: string | null;
  payer_name: string | null;
  account_ref: string | null;
  building_id: string | null;
  upload_id: string | null;
  status: EventStatus;
  confidence: number | null;
  suggestion: StoredSuggestion | null;
  suggested_lease_ids: string[] | null;
}

/** What we keep from the engine's MatchOutcome on the event. */
export interface StoredSuggestion {
  summary: string;
  decision: "auto" | "suggest" | "unmatched";
  best: { leaseIds: string[]; label: string; score: number; reasons: { signal: string; detail: string }[] } | null;
  candidates: { leaseIds: string[]; label: string; score: number }[];
}

export interface BuildingRow {
  id: string;
  org_id: string;
  name: string;
  location: string | null;
  default_due_day: number;
  tracking_from: string;
  late_fee_enabled: boolean;
  late_fee_kind: "flat" | "percent";
  late_fee_value: number;
  late_fee_grace_days: number;
}

export interface UnitRow {
  id: string;
  building_id: string;
  code: string;
  code_key: string;
  rent_cents: number;
  deposit_cents: number;
  status: "occupied" | "vacant" | "ready";
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
