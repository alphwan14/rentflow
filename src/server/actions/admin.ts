"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseCents } from "@/core/money";
import { friendlyError } from "../errors";
import { getSession } from "../session";
import { supabaseServer } from "../supabase";
import type { ActionResult } from "../types";

/** Change any landlord's plan (staff only; enforced in SQL). */
export async function adminSetPlan(orgId: string, plan: "free" | "growth" | "pro"): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.isPlatformAdmin) return { ok: false, error: "Only RentFlow staff can change plans." };
  if (!z.string().uuid().safeParse(orgId).success || !["free", "growth", "pro"].includes(plan)) return { ok: false, error: "Something went wrong. Please try again." };
  const db = await supabaseServer();
  const { error } = await db.rpc("set_org_plan", { p_org: orgId, p_plan: plan });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true };
}

async function staffDb() {
  const s = await getSession();
  if (!s?.isPlatformAdmin) return null;
  return supabaseServer();
}

function cents(v: string): number | null {
  try {
    return parseCents(v.trim() || null);
  } catch {
    return NaN;
  }
}

/** Price per unit per month for a paid plan. */
export async function adminSetPlanPrice(plan: "growth" | "pro", price: string): Promise<ActionResult> {
  const db = await staffDb();
  if (!db) return { ok: false, error: "Only RentFlow staff can change prices." };
  const c = cents(price);
  if (c === null || Number.isNaN(c) || c < 0) return { ok: false, error: "Enter the price in shillings, like 150." };
  const { error } = await db.rpc("admin_set_plan_price", { p_plan: plan, p_price_cents: c });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Price saved." };
}

/** A landlord paid RentFlow: record it and move "paid up to" forward. */
export async function adminRecordSubscriptionPayment(orgId: string, form: FormData): Promise<ActionResult<{ paidUntil: string }>> {
  const db = await staffDb();
  if (!db) return { ok: false, error: "Only RentFlow staff can record payments." };
  const amount = cents(String(form.get("amount") ?? ""));
  if (!amount || Number.isNaN(amount) || amount <= 0) return { ok: false, error: "Enter how much they paid." };
  const months = Number(form.get("months"));
  const paidOn = String(form.get("paid_on") ?? "");
  const method = String(form.get("method") ?? "mpesa");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, error: "Choose the date they paid." };
  const { data, error } = await db.rpc("admin_record_subscription_payment", {
    p_org: orgId,
    p_amount_cents: amount,
    p_paid_on: paidOn,
    p_months: months,
    p_method: method,
    p_reference: String(form.get("reference") ?? "").slice(0, 60) || null,
    p_note: String(form.get("note") ?? "").slice(0, 200) || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true, data: { paidUntil: data as string } };
}

/** Trial end, cancel / reactivate, special price, notes. */
export async function adminUpdateSubscription(orgId: string, form: FormData): Promise<ActionResult> {
  const db = await staffDb();
  if (!db) return { ok: false, error: "Only RentFlow staff can change subscriptions." };
  const status = String(form.get("status") ?? "trial");
  if (!["trial", "active", "cancelled"].includes(status)) return { ok: false, error: "Choose a status." };
  const trial = String(form.get("trial_ends") ?? "");
  const price = String(form.get("price_override") ?? "");
  const override = price.trim() ? cents(price) : null;
  if (override !== null && (Number.isNaN(override) || override < 0)) return { ok: false, error: "Enter the special price in shillings, or leave it empty." };
  const { error } = await db.rpc("admin_update_subscription", {
    p_org: orgId,
    p_status: status,
    p_trial_ends: /^\d{4}-\d{2}-\d{2}$/.test(trial) ? trial : null,
    p_price_override_cents: override,
    p_notes: String(form.get("notes") ?? "").slice(0, 500),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}
