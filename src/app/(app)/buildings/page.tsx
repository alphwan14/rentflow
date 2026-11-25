import type { Metadata } from "next";
import Link from "next/link";
import { hasFeature } from "@/core/plans";
import { getBuildings, getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, Money, PageHeader } from "@/ui";
import { IconChevronRight } from "@/ui/icons";

export const metadata: Metadata = { title: "Buildings" };

export default async function BuildingsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [buildings, units, leases] = await Promise.all([getBuildings(db, s.org.orgId), getUnits(db, s.org.orgId), getLeases(db, s.org.orgId)]);
  const canAdd = buildings.length === 0 || hasFeature(s.org.plan, "multiple_buildings");
  return (
    <div>
      <PageHeader
        title="Buildings"
        action={canAdd ? <ButtonLink href="/buildings/new">Add building</ButtonLink> : <span className="text-[13px] text-muted">More buildings need the Pro plan</span>}
      />
      {buildings.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {buildings.map((b) => {
            const us = units.filter((u) => u.building_id === b.id);
            const ls = leases.filter((l) => l.building_id === b.id);
            const owed = ls.reduce((t, l) => t + Math.max(0, l.balance_cents), 0);
            const vacant = us.filter((u) => u.status !== "occupied").length;
            return (
              <Link key={b.id} href={`/buildings/${b.id}`} className="block">
                <Card className="p-5 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-semibold">{b.name}</h2>
                      {b.location && <p className="text-[13px] text-muted">{b.location}</p>}
                    </div>
                    <IconChevronRight className="text-muted" />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                    <div>
                      <dt className="text-muted">Units</dt>
                      <dd className="num mt-0.5 text-[18px] font-semibold">{us.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Vacant</dt>
                      <dd className="num mt-0.5 text-[18px] font-semibold">{vacant}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Owed</dt>
                      <dd className="mt-0.5 text-[18px] font-semibold">
                        <Money cents={owed} />
                      </dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState title="No buildings yet" action={<ButtonLink href="/onboarding/building">Set up a building</ButtonLink>} />
        </Card>
      )}
    </div>
  );
}
