"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyError } from "../errors";
import { ORG_COOKIE, getSession, requireOrg, type Role } from "../session";
import { supabaseServer } from "../supabase";
import type { ActionResult } from "../types";

export type FormState = { error?: string; message?: string } | undefined;

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function createOrg(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const name = z.string().trim().min(2, "Enter a name for the account").max(120).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const db = await supabaseServer();
  const yourName = String(form.get("your_name") ?? "").trim();
  if (yourName) await db.from("profiles").update({ full_name: yourName }).eq("user_id", s.userId);
  const { data, error } = await db.rpc("create_org", { p_name: name.data });
  if (error) return { error: friendlyError(error) };
  (await cookies()).set(ORG_COOKIE, data as string, COOKIE_OPTS);
  redirect("/onboarding/building");
}

export async function switchOrg(orgId: string): Promise<void> {
  const s = await getSession();
  if (!s?.orgs.some((o) => o.orgId === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, COOKIE_OPTS);
  redirect("/home");
}

export async function renameOrg(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireOrg();
  const name = z.string().trim().min(2).max(120).safeParse(form.get("name"));
  if (!name.success) return { error: "Enter a name" };
  const db = await supabaseServer();
  const { error } = await db.from("orgs").update({ name: name.data }).eq("id", s.org.orgId);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { message: "Saved" };
}

const ROLES = ["owner", "manager", "caretaker", "viewer"] as const;

export async function createInvite(role: Role): Promise<ActionResult<{ token: string }>> {
  const s = await requireOrg();
  if (!ROLES.includes(role)) return { ok: false, error: "Pick a role" };
  const db = await supabaseServer();
  const { data, error } = await db.rpc("create_invite", { p_org: s.org.orgId, p_role: role });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: { token: data as string } };
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const db = await supabaseServer();
  const { data, error } = await db.rpc("accept_invite", { p_token: token });
  if (error) return { ok: false, error: friendlyError(error) };
  (await cookies()).set(ORG_COOKIE, data as string, COOKIE_OPTS);
  redirect("/home");
}

export async function setMemberRole(userId: string, role: Role): Promise<ActionResult> {
  const s = await requireOrg();
  const db = await supabaseServer();
  const { error } = await db.rpc("set_member_role", { p_org: s.org.orgId, p_user: userId, p_role: role });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const s = await requireOrg();
  const db = await supabaseServer();
  const { error } = await db.rpc("remove_member", { p_org: s.org.orgId, p_user: userId });
  if (error) return { ok: false, error: friendlyError(error) };
  if (userId === s.userId) {
    (await cookies()).delete(ORG_COOKIE);
    redirect("/home");
  }
  refresh();
  return { ok: true };
}

/** RentFlow staff only (enforced in SQL). */
export async function setPlan(plan: "free" | "growth" | "pro"): Promise<ActionResult> {
  const s = await requireOrg();
  const db = await supabaseServer();
  const { error } = await db.rpc("set_org_plan", { p_org: s.org.orgId, p_plan: plan });
  if (error) return { ok: false, error: friendlyError(error) };
  refresh();
  return { ok: true };
}
