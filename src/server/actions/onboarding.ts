"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UnitPatternError, expandUnitPattern } from "@/core/import/unit-pattern";
import { parseCents } from "@/core/money";
import { friendlyError } from "../errors";
import { ORG_COOKIE, getSession } from "../session";
import { supabaseServer } from "../supabase";

export type StepState = { error?: string; field?: string } | undefined;

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

/**
 * Step 1 — "Name your building". Creates the landlord's account on first use
 * (named after the person, renameable in Settings), then the building.
 */
export async function nameBuilding(_: StepState, form: FormData): Promise<StepState> {
  const s = await getSession();
  if (!s) redirect("/login?next=/onboarding");
  const name = z.string().trim().min(2, "Give your building a name.").max(120).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message, field: "name" };
  const location = String(form.get("location") ?? "").trim().slice(0, 120) || null;
  const db = await supabaseServer();

  let orgId = s.org?.orgId ?? null;
  if (!orgId || form.get("new_account")) {
    const { data, error } = await db.rpc("create_org", { p_name: s.name ? `${s.name}'s rentals` : name.data });
    if (error) return { error: friendlyError(error) };
    orgId = data as string;
    (await cookies()).set(ORG_COOKIE, orgId, COOKIE_OPTS);
  }
  const month = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7) + "-01";
  const { data: building, error } = await db.rpc("create_building", {
    p_org: orgId,
    p_name: name.data,
    p_location: location,
    p_due_day: 5,
    p_tracking_from: month,
    p_units: [],
    p_channel: null,
  });
  if (error) return { error: friendlyError(error), field: "name" };
  redirect(`/onboarding/units?b=${building}`);
}

const unitsSchema = z.object({
  building_id: z.string().uuid(),
  pattern: z.string().trim().min(1, "Type your unit numbers, like A1-A20."),
  rent: z.string().trim().min(1, "Enter the usual rent."),
  deposit: z.string().trim().optional(),
  due_day: z.coerce.number().int().min(1).max(28),
  tracking_from: z.string().regex(/^\d{4}-\d{2}-01$/),
  pay_kind: z.enum(["paybill", "till", "bank"]),
  pay_number: z.string().trim().max(30).optional(),
});

/** Step 2 — "Add your units": unit numbers, usual rent, how tenants pay. */
export async function addUnits(_: StepState, form: FormData): Promise<StepState> {
  const parsed = unitsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i.message, field: String(i.path[0] ?? "") };
  }
  const v = parsed.data;
  let codes: string[];
  let rent: number | null;
  let deposit: number | null;
  try {
    codes = expandUnitPattern(v.pattern);
  } catch (e) {
    return { error: e instanceof UnitPatternError ? e.message : "We couldn't read those unit numbers.", field: "pattern" };
  }
  try {
    rent = parseCents(v.rent);
    deposit = parseCents(v.deposit || null);
  } catch {
    return { error: "Enter amounts in shillings, like 15,000.", field: "rent" };
  }
  if (!rent || rent <= 0) return { error: "Enter the usual rent.", field: "rent" };
  if (v.pay_number && !/^[0-9A-Za-z-]{3,30}$/.test(v.pay_number)) return { error: "That number doesn't look right.", field: "pay_number" };

  const db = await supabaseServer();
  const { data: b } = await db.from("buildings").select("id, org_id").eq("id", v.building_id).maybeSingle();
  if (!b) return { error: "We couldn't find that building. Start again." };
  const { error } = await db.rpc("add_units", {
    p_building: b.id,
    p_units: codes.map((code) => ({ code, rent_cents: rent, deposit_cents: deposit ?? 0 })),
  });
  if (error) return { error: friendlyError(error), field: "pattern" };
  await db.from("buildings").update({ default_due_day: v.due_day, tracking_from: v.tracking_from }).eq("id", b.id);
  if (v.pay_number) {
    const { error: e2 } = await db.from("payout_channels").insert({ org_id: b.org_id, building_id: b.id, kind: v.pay_kind, number: v.pay_number });
    if (e2 && !/duplicate/i.test(e2.message)) return { error: friendlyError(e2), field: "pay_number" };
  }
  redirect(`/onboarding/tenants?b=${b.id}`);
}
