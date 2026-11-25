import type { Metadata } from "next";
import { PLAN_LABEL, UNIT_LIMIT } from "@/core/plans";
import { getTeam, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Card, CardHeader, PageHeader, Pill } from "@/ui";
import { InviteForm, MemberRow, OrgNameForm, PlanSwitcher } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [team, units] = await Promise.all([getTeam(db, s.org.orgId), getUnits(db, s.org.orgId)]);
  const owner = s.org.role === "owner";
  const limit = UNIT_LIMIT[s.org.plan];

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader title="Account" sub="The landlord or company these buildings belong to." />
        <div className="px-5 pb-5">{owner ? <OrgNameForm name={s.org.orgName} /> : <p className="text-[15px]">{s.org.orgName}</p>}</div>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Plan <Pill tone="accent">{PLAN_LABEL[s.org.plan]}</Pill>
            </span>
          }
          sub={limit ? `${units.length} of ${limit} units used` : `${units.length} units`}
        />
        <div className="px-5 pb-5 text-[14px] text-ink-2">
          Every plan matches payments automatically. Growth adds live M-Pesa matching, automatic reminders, caretakers, water billing, late fees and
          deposits. Pro adds more buildings, WhatsApp, owner statements, tax summaries and expenses.
          {s.isPlatformAdmin && (
            <div className="mt-4">
              <PlanSwitcher plan={s.org.plan} />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Team" sub="Owners and managers can do everything. Caretakers record payments and readings. Viewers can only look." />
        <ul className="divide-y divide-line border-t border-line">
          {team.map((m) => (
            <MemberRow key={m.user_id} member={m} isSelf={m.user_id === s.userId} canEdit={owner} />
          ))}
        </ul>
        {(owner || s.org.role === "manager") && (
          <div className="border-t border-line px-5 py-5">
            <InviteForm canInviteOwners={owner} />
          </div>
        )}
      </Card>
    </div>
  );
}
