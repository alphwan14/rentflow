import "server-only";
import { matchBatch } from "@/core/matching/engine";
import type { IncomingPayment, LeaseCandidate, MatchContext, MatchOutcome, MatchRule } from "@/core/matching/types";
import type { Db } from "./supabase";
import type { LeaseOverview, PaymentEventRow, StoredSuggestion } from "./types";

/** Everything the engine needs: active leases with balances and phones, plus learned rules. */
export async function loadMatchContext(db: Db, orgId: string): Promise<{ leases: LeaseCandidate[]; rules: MatchRule[]; byBuilding: Map<string, LeaseCandidate[]> }> {
  const [{ data: leases, error: e1 }, { data: rules, error: e2 }] = await Promise.all([
    db
      .from("lease_overview")
      .select("lease_id, tenant_id, tenant_name, unit_code, building_id, rent_cents, balance_cents, oldest_unpaid_due, phones")
      .eq("org_id", orgId)
      .eq("status", "active"),
    db.from("match_rules").select("kind, pattern, tenant_id").eq("org_id", orgId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const candidates: LeaseCandidate[] = (leases ?? []).map((l) => ({
    leaseId: l.lease_id,
    tenantId: l.tenant_id,
    tenantName: l.tenant_name,
    unitCode: l.unit_code,
    buildingId: l.building_id,
    rentCents: Number(l.rent_cents),
    balanceCents: Number(l.balance_cents),
    oldestUnpaidDue: l.oldest_unpaid_due,
    phones: l.phones ?? [],
  }));
  const byBuilding = new Map<string, LeaseCandidate[]>();
  for (const c of candidates) byBuilding.set(c.buildingId, [...(byBuilding.get(c.buildingId) ?? []), c]);
  return {
    leases: candidates,
    rules: (rules ?? []).map((r) => ({ kind: r.kind, pattern: r.pattern, tenantId: r.tenant_id })) as MatchRule[],
    byBuilding,
  };
}

export function toIncoming(e: Pick<PaymentEventRow, "id" | "trans_code" | "amount_cents" | "occurred_at" | "payer_phone" | "payer_phone_masked" | "payer_name" | "account_ref">): IncomingPayment {
  return {
    id: e.id,
    transCode: e.trans_code,
    amountCents: Number(e.amount_cents),
    occurredAt: e.occurred_at,
    payerPhone: e.payer_phone,
    payerPhoneMasked: e.payer_phone_masked,
    payerName: e.payer_name,
    accountRef: e.account_ref,
  };
}

export function toStored(o: MatchOutcome): StoredSuggestion {
  return {
    summary: o.summary,
    decision: o.decision,
    best: o.best
      ? { leaseIds: o.best.leaseIds, label: o.best.label, score: o.best.score, reasons: o.best.reasons.map((r) => ({ signal: r.signal, detail: r.detail })) }
      : null,
    candidates: o.candidates.map((c) => ({ leaseIds: c.leaseIds, label: c.label, score: c.score })),
  };
}

/**
 * Run the engine over stored events and save the decisions (sure matches are
 * posted, the rest go to the inbox). Events tied to a building are only
 * matched against that building's tenants.
 */
export async function matchAndApply(
  db: Db,
  orgId: string,
  events: PaymentEventRow[],
  uploadId: string | null,
): Promise<{ auto: number; suggested: number; unmatched: number }> {
  if (!events.length) return { auto: 0, suggested: 0, unmatched: 0 };
  const ctx = await loadMatchContext(db, orgId);
  const groups = new Map<string, PaymentEventRow[]>();
  for (const e of events) groups.set(e.building_id ?? "*", [...(groups.get(e.building_id ?? "*") ?? []), e]);

  const results: unknown[] = [];
  for (const [building, evs] of groups) {
    const scoped: MatchContext = { leases: building === "*" ? ctx.leases : (ctx.byBuilding.get(building) ?? []), rules: ctx.rules };
    const outcomes = matchBatch(evs.map(toIncoming), scoped);
    for (const e of evs) {
      const o = outcomes.get(e.id)!;
      results.push({
        event_id: e.id,
        decision: o.decision,
        confidence: o.confidence,
        suggestion: toStored(o),
        allocations: o.allocations.map((a) => ({ lease_id: a.leaseId, amount_cents: a.amountCents })),
        suggested_lease_ids: o.best?.leaseIds ?? null,
      });
    }
  }
  const { data, error } = await db.rpc("apply_match_results", { p_upload: uploadId, p_results: results });
  if (error) throw error;
  return data as { auto: number; suggested: number; unmatched: number };
}

const EVENT_COLUMNS =
  "id, org_id, source, trans_code, amount_cents, occurred_at, payer_phone, payer_phone_masked, payer_name, account_ref, building_id, upload_id, status, confidence, suggestion, suggested_lease_ids";

/** Re-run matching over everything still in the inbox (after RentFlow learns something). */
export async function rematchInbox(db: Db, orgId: string): Promise<number> {
  const { data, error } = await db
    .from("payment_events")
    .select(EVENT_COLUMNS)
    .eq("org_id", orgId)
    .in("status", ["pending", "suggested", "unmatched"])
    .order("occurred_at")
    .limit(500);
  if (error) throw error;
  const r = await matchAndApply(db, orgId, (data ?? []) as PaymentEventRow[], null);
  return r.auto;
}

export { EVENT_COLUMNS };

export type { LeaseOverview };
