"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseCents } from "@/core/money";
import { friendlyError } from "../errors";
import { requireOrg } from "../session";
import { supabaseServer } from "../supabase";

export type BuildingFormState = { error?: string; field?: string } | undefined;

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
    return { error: "Enter the late fee in shillings or as a percent." };
  }
  if (!Number.isFinite(feeValue) || feeValue < 0) return { error: "Enter the late fee in shillings or as a percent." };
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
