"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { rulesToLearn, splitAcrossLeases } from "@/core/matching/engine";
import { friendlyError } from "../errors";
import { EVENT_COLUMNS, loadMatchContext, rematchInbox, toIncoming } from "../matching";
import { requireOrg } from "../session";
import { supabaseServer } from "../supabase";
import type { ActionResult, PaymentEventRow } from "../types";

const ids = z.array(z.string().uuid()).min(1).max(10);

/**
 * "Yes, that's them" — post the payment to the chosen lease(s), learn the
 * payer for next time, then re-run matching over the rest of the inbox so
 * other payments from the same person clear themselves.
 */
export async function confirmPayment(eventId: string, leaseIds: string[]): Promise<ActionResult<{ alsoMatched: number }>> {
  const s = await requireOrg();
  if (!z.string().uuid().safeParse(eventId).success || !ids.safeParse(leaseIds).success) return { ok: false, error: "Pick a tenant" };
  const db = await supabaseServer();
  const { data: ev, error } = await db.from("payment_events").select(EVENT_COLUMNS).eq("id", eventId).single();
  if (error || !ev) return { ok: false, error: "That payment is no longer in the inbox." };
  const event = ev as PaymentEventRow;

  const ctx = await loadMatchContext(db, s.org.orgId);
  const chosen = leaseIds.map((id) => ctx.leases.find((l) => l.leaseId === id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (chosen.length !== leaseIds.length) return { ok: false, error: "That tenancy has ended. Pick another." };

  const allocations = splitAcrossLeases(Number(event.amount_cents), chosen);
  const tenantIds = [...new Set(chosen.map((l) => l.tenantId))];
  // Only learn when the payment is for one person; a split across tenants teaches nothing reliable.
  const rules = tenantIds.length === 1 ? rulesToLearn(toIncoming(event), tenantIds[0], ctx) : [];

  const { error: e2 } = await db.rpc("post_payment", {
    p_event: eventId,
    p_allocations: allocations.map((a) => ({ lease_id: a.leaseId, amount_cents: a.amountCents })),
    p_rules: rules.map((r) => ({ kind: r.kind, pattern: r.pattern, tenant_id: r.tenantId })),
  });
  if (e2) return { ok: false, error: friendlyError(e2) };

  let alsoMatched = 0;
  if (rules.length) {
    try {
      alsoMatched = await rematchInbox(db, s.org.orgId);
    } catch (e) {
      console.error("rematch failed", e);
    }
  }
  refresh();
  return { ok: true, data: { alsoMatched } };
}

export async function ignorePayment(eventId: string, ignored = true): Promise<ActionResult> {
  await requireOrg();
  const db = await supabaseServer();
  const { error } = await db.rpc("set_event_ignored", { p_event: eventId, p_ignored: ignored });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true };
}

export async function reversePayment(paymentId: string, note: string): Promise<ActionResult> {
  await requireOrg();
  const db = await supabaseServer();
  const { error } = await db.rpc("reverse_payment", { p_payment: paymentId, p_note: note.slice(0, 200) });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true };
}

/** Run the engine again over everything in the inbox. */
export async function rematchAll(): Promise<ActionResult<{ matched: number }>> {
  const s = await requireOrg();
  const db = await supabaseServer();
  try {
    const matched = await rematchInbox(db, s.org.orgId);
    refresh();
    return { ok: true, data: { matched } };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}
