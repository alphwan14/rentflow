"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UnitPatternError, expandUnitPattern } from "@/core/import/unit-pattern";
import { parseCents } from "@/core/money";
import { friendlyError } from "../errors";
import { requireOrg } from "../session";
import { supabaseServer } from "../supabase";

export type BuildingFormState = { error?: string; field?: string } | undefined;

const schema = z.object({
  name: z.string().trim().min(2, "Give the building a name").max(120),
  location: z.string().trim().max(120).optional(),
  pattern: z.string().trim().min(1, "Describe the units, e.g. A1-A20, B1-B20"),
  rent: z.string().trim().optional(),
  deposit: z.string().trim().optional(),
  due_day: z.coerce.number().int().min(1).max(28),
  tracking_from: z.string().regex(/^\d{4}-\d{2}-01$/, "Pick a month"),
  channel_kind: z.enum(["paybill", "till", "bank"]),
  channel_number: z.string().trim().max(30).optional(),
  bank_name: z.string().trim().max(60).optional(),
});

export async function createBuilding(_: BuildingFormState, form: FormData): Promise<BuildingFormState> {
  const s = await requireOrg();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const v = parsed.data;
  let codes: string[];
  let rent: number | null;
  let deposit: number | null;
  try {
    codes = expandUnitPattern(v.pattern);
    rent = parseCents(v.rent || null);
    deposit = parseCents(v.deposit || null);
  } catch (e) {
    return { error: e instanceof UnitPatternError ? e.message : "Check the rent and deposit amounts", field: e instanceof UnitPatternError ? "pattern" : "rent" };
  }
  if (v.channel_number && !/^[0-9A-Za-z-]{3,30}$/.test(v.channel_number)) {
    return { error: "That paybill / till / account number doesn't look right", field: "channel_number" };
  }

  const db = await supabaseServer();
  const { data, error } = await db.rpc("create_building", {
    p_org: s.org.orgId,
    p_name: v.name,
    p_location: v.location ?? null,
    p_due_day: v.due_day,
    p_tracking_from: v.tracking_from,
    p_units: codes.map((code) => ({ code, rent_cents: rent ?? 0, deposit_cents: deposit ?? 0 })),
    p_channel: v.channel_number ? { kind: v.channel_kind, number: v.channel_number, bank_name: v.bank_name ?? null } : null,
  });
  if (error) return { error: friendlyError(error) };
  redirect(form.get("onboarding") ? `/onboarding/tenants?b=${data}` : `/buildings/${data}`);
}

const settings = z.object({
  building_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional(),
  default_due_day: z.coerce.number().int().min(1).max(28),
  late_fee_enabled: z.literal("on").optional(),
  late_fee_kind: z.enum(["flat", "percent"]),
  late_fee_value: z.string().trim().optional(),
  late_fee_grace_days: z.coerce.number().int().min(0).max(28),
});

export async function updateBuildingSettings(_: BuildingFormState, form: FormData): Promise<BuildingFormState> {
  await requireOrg();
  const parsed = settings.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  let feeValue = 0;
  try {
    if (v.late_fee_kind === "flat") feeValue = parseCents(v.late_fee_value || "0") ?? 0;
    else feeValue = Math.round(Number(v.late_fee_value || "0") * 100); // percent → basis points
  } catch {
    return { error: "Check the late fee amount" };
  }
  if (!Number.isFinite(feeValue) || feeValue < 0) return { error: "Check the late fee amount" };
  const db = await supabaseServer();
  const { error } = await db
    .from("buildings")
    .update({
      name: v.name,
      location: v.location || null,
      default_due_day: v.default_due_day,
      late_fee_enabled: v.late_fee_enabled === "on",
      late_fee_kind: v.late_fee_kind,
      late_fee_value: feeValue,
      late_fee_grace_days: v.late_fee_grace_days,
    })
    .eq("id", v.building_id);
  if (error) return { error: friendlyError(error) };
  refresh();
  return undefined;
}

export async function setUnitStatus(unitId: string, status: "vacant" | "ready"): Promise<void> {
  await requireOrg();
  const db = await supabaseServer();
  await db.from("units").update({ status }).eq("id", unitId).neq("status", "occupied");
  refresh();
}
