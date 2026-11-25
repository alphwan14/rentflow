"use server";

import { refresh } from "next/cache";
import { z } from "zod";
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
