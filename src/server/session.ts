import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Plan } from "@/core/plans";
import { supabaseServer } from "./supabase";

export type Role = "owner" | "manager" | "caretaker" | "viewer";

export interface OrgMembership {
  orgId: string;
  orgName: string;
  plan: Plan;
  role: Role;
}

export interface Session {
  userId: string;
  email: string | null;
  name: string | null;
  orgs: OrgMembership[];
  /** The organisation currently being viewed (cookie rf_org, else the first). */
  org: OrgMembership | null;
  isPlatformAdmin: boolean;
}

export const ORG_COOKIE = "rf_org";

/** The signed-in user and their organisations. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const [{ data: members }, { data: profile }, { data: admin }] = await Promise.all([
    db.from("members").select("org_id, role, orgs(name, plan)").eq("user_id", user.id),
    db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  const orgs: OrgMembership[] = (members ?? [])
    .map((m) => {
      const o = (Array.isArray(m.orgs) ? m.orgs[0] : m.orgs) as { name: string; plan: Plan } | null;
      return { orgId: m.org_id as string, orgName: o?.name ?? "", plan: (o?.plan ?? "free") as Plan, role: m.role as Role };
    })
    .sort((a, b) => a.orgName.localeCompare(b.orgName));

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.orgId === wanted) ?? orgs[0] ?? null;

  return {
    userId: user.id,
    email: user.email ?? null,
    name: (profile?.full_name as string | null) ?? null,
    orgs,
    org,
    isPlatformAdmin: !!admin,
  };
});

/** For pages that need a signed-in user with an organisation. */
export async function requireOrg(): Promise<Session & { org: OrgMembership }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.org) redirect("/onboarding");
  return s as Session & { org: OrgMembership };
}

export function canManage(role: Role): boolean {
  return role === "owner" || role === "manager";
}
