import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/profile";
import { canManageTeam, canTransferOwnership, roleLabel } from "@/lib/auth/permissions";
import { signOut } from "@/lib/auth/actions";
import type { OrgInvite, TeamMember } from "@/lib/supabase/types";
import {
  OrgNameForm,
  InviteForm,
  RevokeInviteButton,
  MemberActions,
  TransferOwnershipForm,
} from "./settings-forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");

  const supabase = await createClient();
  const manager = canManageTeam(profile.role);

  const [{ data: org }, { data: membersData }, invitesResult] = await Promise.all([
    supabase.from("orgs").select("id,name").maybeSingle(),
    supabase.rpc("list_members"),
    manager
      ? supabase
          .from("org_invites")
          .select("*")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const members = (membersData ?? []) as TeamMember[];
  const invites = (invitesResult.data ?? []) as OrgInvite[];
  const dateFmt = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      {/* ---- organization ---- */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Organization
        </h2>
        {manager ? (
          <OrgNameForm currentName={org?.name ?? ""} />
        ) : (
          <p className="text-slate-900">{org?.name}</p>
        )}
      </Card>

      {/* ---- team ---- */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Team</h2>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {m.full_name?.trim() || m.email || "Unnamed"}
                  {m.id === profile.id ? (
                    <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-slate-500">{m.email}</p>
              </div>
              {manager ? (
                <MemberActions member={m} selfId={profile.id} />
              ) : (
                <span className="text-sm font-medium text-slate-500">{roleLabel(m.role)}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* ---- invites (managers only) ---- */}
      {manager ? (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Invite staff
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Caretakers can record payments. Admins can also manage tenants and staff. Viewers can
            only look.
          </p>
          <InviteForm />

          {invites.length > 0 ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pending invites
              </h3>
              <ul className="divide-y divide-slate-100">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {inv.email ?? "Link invite"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {roleLabel(inv.role)} · expires {dateFmt.format(new Date(inv.expires_at))}
                      </p>
                    </div>
                    <RevokeInviteButton inviteId={inv.id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ---- ownership (owner only) ---- */}
      {canTransferOwnership(profile.role) ? (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ownership
          </h2>
          <TransferOwnershipForm members={members} selfId={profile.id} />
        </Card>
      ) : null}

      {/* ---- account ---- */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">{profile.full_name?.trim() || "Unnamed"}</p>
            <p className="text-sm text-slate-500">Signed in as {roleLabel(profile.role)}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
