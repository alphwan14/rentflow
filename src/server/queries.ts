import "server-only";
import type { LedgerEntry } from "@/core/ledger";
import type { PayTo } from "@/core/messages";
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
  return (data as LeaseOverview[])
    .map((r) => num(r, ["rent_cents", "deposit_cents", "balance_cents", "credits_cents", "paid_this_month_cents"]))
    .sort((a, b) => a.building_name.localeCompare(b.building_name) || a.unit_code.localeCompare(b.unit_code, "en", { numeric: true }));
}

/** Tenants who have moved out (newest first). `owingOnly` keeps those who still owe. */
export async function getPastTenants(db: Db, orgId: string, opts: { buildingId?: string | null; owingOnly?: boolean } = {}): Promise<LeaseOverview[]> {
  let q = db.from("lease_overview").select(LEASE_COLUMNS).eq("org_id", orgId).eq("status", "ended");
  if (opts.buildingId) q = q.eq("building_id", opts.buildingId);
  if (opts.owingOnly) q = q.gt("balance_cents", 0);
  const { data, error } = await q.order("end_date", { ascending: false });
  if (error) throw error;
  return (data as LeaseOverview[]).map((r) => num(r, ["rent_cents", "deposit_cents", "balance_cents", "credits_cents", "paid_this_month_cents"]));
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

export interface LeasePayment {
  id: string;
  amount_cents: number;
  paid_at: string;
  reference: string;
  method: string;
  match_method: string;
  status: string;
  payer_phone: string | null;
  payer_phone_masked: string | null;
  payer_name: string | null;
}

export interface LeaseDetail {
  lease: LeaseOverview;
  entries: LedgerEntry[];
  payments: LeasePayment[];
  payTo: PayTo | null;
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
      .select("id, amount_cents, paid_at, reference, method, match_method, status, payment_events(payer_phone, payer_phone_masked, payer_name)")
      .eq("lease_id", leaseId)
      .order("paid_at", { ascending: false }),
  ]);
  if (!lease) return null;
  const l = num(lease as LeaseOverview, ["rent_cents", "deposit_cents", "balance_cents", "credits_cents", "paid_this_month_cents"]);
  return {
    lease: l,
    payTo: await getPayTo(db, l.org_id, l.building_id),
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
    payments: (payments ?? []).map((p) => {
      const ev = (Array.isArray(p.payment_events) ? p.payment_events[0] : p.payment_events) as { payer_phone: string | null; payer_phone_masked: string | null; payer_name: string | null } | null;
      return {
        id: p.id,
        amount_cents: Number(p.amount_cents),
        paid_at: p.paid_at,
        reference: p.reference,
        method: p.method,
        match_method: p.match_method,
        status: p.status,
        payer_phone: ev?.payer_phone ?? null,
        payer_phone_masked: ev?.payer_phone_masked ?? null,
        payer_name: ev?.payer_name ?? null,
      };
    }),
  };
}

/** Where tenants of a building pay (building's channel, else the org-wide one). */
export async function getPayTo(db: Db, orgId: string, buildingId: string): Promise<PayTo | null> {
  const { data } = await db
    .from("payout_channels")
    .select("kind, number, bank_name, building_id")
    .eq("org_id", orgId)
    .or(`building_id.eq.${buildingId},building_id.is.null`);
  const c = (data ?? []).sort((a, b) => (a.building_id ? -1 : 0) - (b.building_id ? -1 : 0))[0];
  return c ? { kind: c.kind, number: c.number, bankName: c.bank_name } : null;
}

export interface PaymentListItem {
  id: string;
  source: string;
  trans_code: string;
  amount_cents: number;
  occurred_at: string;
  payer_name: string | null;
  payer_phone: string | null;
  payer_phone_masked: string | null;
  status: string;
  lease_id: string | null;
  tenant_name: string | null;
  unit_code: string | null;
}

/** Every payment RentFlow knows about, newest first. */
export async function getPayments(db: Db, orgId: string, limit = 150): Promise<PaymentListItem[]> {
  const { data, error } = await db
    .from("payment_events")
    .select("id, source, trans_code, amount_cents, occurred_at, payer_name, payer_phone, payer_phone_masked, status, payments(lease_id, status, leases(units(code), tenants(full_name)))")
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((e) => {
    type One<T> = T | T[] | null;
    const pays = (Array.isArray(e.payments) ? e.payments : e.payments ? [e.payments] : []) as unknown as {
      lease_id: string;
      status: string;
      leases: One<{ units: One<{ code: string }>; tenants: One<{ full_name: string }> }>;
    }[];
    const live = pays.find((p) => p.status === "posted");
    const lease = live ? (Array.isArray(live.leases) ? live.leases[0] : live.leases) : null;
    const unit = lease ? (Array.isArray(lease.units) ? lease.units[0] : lease.units) : null;
    const tenant = lease ? (Array.isArray(lease.tenants) ? lease.tenants[0] : lease.tenants) : null;
    return {
      id: e.id,
      source: e.source,
      trans_code: e.trans_code,
      amount_cents: Number(e.amount_cents),
      occurred_at: e.occurred_at,
      payer_name: e.payer_name,
      payer_phone: e.payer_phone,
      payer_phone_masked: e.payer_phone_masked,
      status: e.status,
      lease_id: live?.lease_id ?? null,
      tenant_name: tenant?.full_name ?? null,
      unit_code: unit?.code ?? null,
    };
  });
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
