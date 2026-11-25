import type { Metadata } from "next";
import { PLAN_LABEL, UNIT_LIMIT, hasFeature } from "@/core/plans";
import { getBuildings, getTeam, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, CardTitle, List, ListRow, PageTitle } from "@/ui";
import { emailConfigured } from "@/server/email";
import { InviteForm, MemberRow, OrgNameForm, PlanSwitcher } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [team, units, buildings] = await Promise.all([getTeam(db, s.org.orgId), getUnits(db, s.org.orgId), getBuildings(db, s.org.orgId)]);
  const owner = s.org.role === "owner";
  const limit = UNIT_LIMIT[s.org.plan];
  const canAddBuilding = buildings.length === 0 || hasFeature(s.org.plan, "multiple_buildings");

  return (
    <div className="fade-in mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <PageTitle>Settings</PageTitle>

      <Card>
        <CardTitle sub="The name your team sees.">Your account</CardTitle>
        <div className="px-6 pb-6">{owner ? <OrgNameForm name={s.org.orgName} /> : <p className="text-[15px]">{s.org.orgName}</p>}</div>
      </Card>

      <Card>
        <CardTitle sub="Names, due dates and late fees." action={canAddBuilding ? <ButtonLink href="/onboarding" variant="secondary" size="sm">Add a building</ButtonLink> : undefined}>
          Buildings
        </CardTitle>
        <List className="border-t border-line">
          {buildings.map((b) => (
            <ListRow key={b.id} href={`/settings/buildings/${b.id}`} title={b.name} sub={`${units.filter((u) => u.building_id === b.id).length} units · rent due on day ${b.default_due_day}`} end={<span className="text-[15px] text-accent">Edit</span>} />
          ))}
        </List>
        {!canAddBuilding && <p className="px-6 pb-6 text-[13px] text-muted">More than one building comes with the Pro plan.</p>}
      </Card>

      <Card>
        <CardTitle sub="Owners and managers can do everything. Caretakers record payments. Viewers can only look.">Your team</CardTitle>
        <ul className="divide-y divide-line border-t border-line">
          {team.map((m) => (
            <MemberRow key={m.user_id} member={m} isSelf={m.user_id === s.userId} canEdit={owner} />
          ))}
        </ul>
        {(owner || s.org.role === "manager") && (
          <div className="border-t border-line p-6">
            <InviteForm canInviteOwners={owner} emailOn={emailConfigured()} orgName={s.org.orgName} />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle sub={limit ? `${units.length} of ${limit} units used` : `${units.length} units`}>Plan: {PLAN_LABEL[s.org.plan]}</CardTitle>
        <div className="px-6 pb-6 text-[15px] text-muted">
          Every plan matches payments automatically. Growth adds live M-Pesa matching, automatic reminders, a caretaker, water bills, late fees and deposits. Pro adds more buildings, WhatsApp, owner statements, tax summaries and expenses.
          {s.isPlatformAdmin && (
            <div className="mt-4">
              <PlanSwitcher plan={s.org.plan} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
