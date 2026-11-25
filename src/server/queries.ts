import "server-only";
import type { LedgerEntry } from "@/core/ledger";
import { addMonths, periodOf, todayNairobi } from "@/core/period";
import { EVENT_COLUMNS } from "./matching";
import type { Db } from "./supabase";
import type { BuildingRow, LeaseOverview, PaymentEventRow, UnitRow } from "./types";

const LEASE_COLUMNS =
  "lease_id, org_id, status, start_date, end_date, rent_cents, deposit_cents, due_day, unit_id, unit_code, code_key, building_id, building_name, tenant_id, tenant_name, balance_cents, credits_cents, oldest_unpaid_due, last_paid_on, paid_this_month_cents, phones";

function num<T extends object>(row: T, keys: (keyof T)[]): T {
  for (const k of keys) (row as Record<string, unknown>)[k as string] = Number(row[k] ?? 0);
  return row;
}

export async function getLeases(db: Db, orgId: string, buildingId?: string | null): Promise<LeaseOverview[]> {
  let q = db.from("lease_overview").select(LEASE_COLUMNS).eq("org_id", orgId).eq("status", "active");
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q.order("unit_code");
  if (error) throw error;
  return (data as LeaseOverview[]).map((r) =>
    num(r, ["rent_cents", "deposit_cents", "balance_cents", "credits_cents", "paid_this_month_cents"]),
  );
}

export async function getBuildings(db: Db, orgId: string): Promise<BuildingRow[]> {
  const { data, error } = await db
    .from("buildings")
    .select("id, org_id, name, location, default_due_day, tracking_from, late_fee_enabled, late_fee_kind, late_fee_value, late_fee_grace_days")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data as BuildingRow[];
}

export async function getUnits(db: Db, orgId: string, buildingId?: string | null): Promise<UnitRow[]> {
  let q = db.from("units").select("id, building_id, code, code_key, rent_cents, deposit_cents, status").eq("org_id", orgId).is("archived_at", null);
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as UnitRow[])
    .map((u) => num(u, ["rent_cents", "deposit_cents"]))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

export interface MonthPoint {
  period: string;
  billed: number;
  collected: number;
}

/** Billed vs collected for the last `months` months (oldest first). */
export async function getCollections(db: Db, orgId: string, buildingId: string | null, months = 6): Promise<MonthPoint[]> {
  const current = periodOf(todayNairobi());
  const from = addMonths(current, -(months - 1));
  let q = db.from("monthly_collections").select("period, billed_cents, collected_cents").eq("org_id", orgId).gte("period", from);
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) throw error;
  const by = new Map<string, MonthPoint>();
  for (let i = 0; i < months; i++) {
    const p = addMonths(from, i);
    by.set(p, { period: p, billed: 0, collected: 0 });
  }
  for (const r of data ?? []) {
    const m = by.get(r.period);
    if (m) {
      m.billed += Number(r.billed_cents);
      m.collected += Number(r.collected_cents);
    }
  }
  return [...by.values()];
}

export async function getInbox(db: Db, orgId: string, buildingId?: string | null, limit = 100): Promise<{ events: PaymentEventRow[]; count: number }> {
  let q = db
    .from("payment_events")
    .select(EVENT_COLUMNS, { count: "exact" })
    .eq("org_id", orgId)
    .in("status", ["pending", "suggested", "unmatched"]);
  if (buildingId) q = q.or(`building_id.eq.${buildingId},building_id.is.null`);
  const { data, error, count } = await q.order("occurred_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return { events: (data as PaymentEventRow[]).map((e) => num(e, ["amount_cents"])), count: count ?? 0 };
}

export interface LeaseDetail {
  lease: LeaseOverview;
  entries: LedgerEntry[];
  payments: { id: string; amount_cents: number; paid_at: string; reference: string; method: string; match_method: string; status: string }[];
}

export async function getLeaseDetail(db: Db, leaseId: string): Promise<LeaseDetail | null> {
  const [{ data: lease }, { data: entries }, { data: payments }] = await Promise.all([
    db.from("lease_overview").select(LEASE_COLUMNS).eq("lease_id", leaseId).maybeSingle(),
    db
      .from("ledger_entries")
      .select("id, seq, kind, amount_cents, effective_date, reverses_id, payment_id, memo, charges(kind, period, description)")
      .eq("lease_id", leaseId)
      .order("effective_date")
      .order("seq"),
    db
      .from("payments")
      .select("id, amount_cents, paid_at, reference, method, match_method, status")
      .eq("lease_id", leaseId)
      .order("paid_at", { ascending: false }),
  ]);
  if (!lease) return null;
  return {
    lease: num(lease as LeaseOverview, ["rent_cents", "deposit_cents", "balance_cents", "credits_cents", "paid_this_month_cents"]),
    entries: (entries ?? []).map((e) => {
      const c = (Array.isArray(e.charges) ? e.charges[0] : e.charges) as { kind: string; period: string | null; description: string | null } | null;
      return {
        id: e.id,
        seq: Number(e.seq),
        kind: e.kind,
        amountCents: Number(e.amount_cents),
        effectiveDate: e.effective_date,
        reversesId: e.reverses_id,
        paymentId: e.payment_id,
        chargeKind: (c?.kind ?? null) as LedgerEntry["chargeKind"],
        period: c?.period ?? null,
        description: c?.description ?? (e.kind === "charge" ? null : e.memo),
      } satisfies LedgerEntry;
    }),
    payments: (payments ?? []).map((p) => num(p, ["amount_cents"])),
  };
}

export interface UploadRow {
  id: string;
  building_id: string | null;
  filename: string;
  format: string;
  period_start: string | null;
  period_end: string | null;
  total_payments: number;
  new_events: number;
  duplicate_events: number;
  skipped_lines: number;
  auto_matched: number;
  suggested: number;
  unmatched: number;
  created_at: string;
}

export async function getUploads(db: Db, orgId: string): Promise<UploadRow[]> {
  const { data, error } = await db
    .from("statement_uploads")
    .select("id, building_id, filename, format, period_start, period_end, total_payments, new_events, duplicate_events, skipped_lines, auto_matched, suggested, unmatched, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as UploadRow[];
}

export async function getUpload(db: Db, id: string): Promise<{ upload: UploadRow; events: PaymentEventRow[] } | null> {
  const [{ data: upload }, { data: events }] = await Promise.all([
    db
      .from("statement_uploads")
      .select("id, building_id, filename, format, period_start, period_end, total_payments, new_events, duplicate_events, skipped_lines, auto_matched, suggested, unmatched, created_at")
      .eq("id", id)
      .maybeSingle(),
    db.from("payment_events").select(EVENT_COLUMNS).eq("upload_id", id).order("occurred_at", { ascending: false }),
  ]);
  if (!upload) return null;
  return { upload: upload as UploadRow, events: ((events ?? []) as PaymentEventRow[]).map((e) => num(e, ["amount_cents"])) };
}

export interface TeamMember {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
}

export async function getTeam(db: Db, orgId: string): Promise<TeamMember[]> {
  const { data: members } = await db.from("members").select("user_id, role").eq("org_id", orgId);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("user_id, email, full_name").in("user_id", ids) : { data: [] };
  const by = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  return (members ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: by.get(m.user_id)?.email ?? null,
    full_name: by.get(m.user_id)?.full_name ?? null,
  }));
}
