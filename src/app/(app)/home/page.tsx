import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { formatPeriod, periodOf, todayNairobi } from "@/core/period";
import { getBuildings, getCollections, getInbox, getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, CardHeader, Count, EmptyState, LinkTabs, Money, StatCard } from "@/ui";
import { CollectionsChart } from "@/ui/collections-chart";
import { IconDoor, IconUsers, IconWallet, IconClock } from "@/ui/icons";
import { BuildingFilter } from "../building-filter";
import { InboxList } from "../inbox/inbox-list";
import { OwingTable } from "../owing-table";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const s = await requireOrg();
  const sp = await searchParams;
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);

  if (!buildings.length) {
    return (
      <Card>
        <EmptyState
          title="Let's set up your first building"
          body="Add the units, import the tenants and upload an M-Pesa statement. RentFlow shows who owes what in about half an hour."
          action={<ButtonLink href="/onboarding/building">Set up a building</ButtonLink>}
        />
      </Card>
    );
  }

  const buildingId = typeof sp.b === "string" && buildings.some((b) => b.id === sp.b) ? sp.b : null;
  const tab = sp.tab === "inbox" ? "inbox" : "owing";
  const [leases, units, chart, inbox] = await Promise.all([
    getLeases(db, s.org.orgId, buildingId),
    getUnits(db, s.org.orgId, buildingId),
    getCollections(db, s.org.orgId, buildingId, 6),
    getInbox(db, s.org.orgId, buildingId, 20),
  ]);

  const month = periodOf(todayNairobi());
  const collected = leases.reduce((t, l) => t + l.paid_this_month_cents, 0);
  const owing = leases.filter((l) => l.balance_cents > 0).sort((a, b) => b.balance_cents - a.balance_cents);
  const stillOwed = owing.reduce((t, l) => t + l.balance_cents, 0);
  const vacant = units.filter((u) => u.status !== "occupied");
  const ready = vacant.filter((u) => u.status === "ready").length;
  const billedThisMonth = chart.at(-1)?.billed ?? 0;

  const href = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (buildingId) q.set("b", buildingId);
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const str = q.toString();
    return `/home${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">{formatPeriod(month, true)}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {stillOwed > 0 ? (
              <>
                You&apos;re owed <span className="num font-medium text-ink">{formatKES(stillOwed)}</span> by {owing.length}{" "}
                {owing.length === 1 ? "tenant" : "tenants"}.
              </>
            ) : (
              "Everyone is paid up."
            )}
          </p>
        </div>
        {buildings.length > 1 && <BuildingFilter buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} active={buildingId} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Collected"
          value={<Money cents={collected} />}
          hint={billedThisMonth ? `of ${formatKES(billedThisMonth)} billed this month` : "this month"}
          icon={<IconWallet />}
        />
        <StatCard label="Still owed" value={<Money cents={stillOwed} />} hint="including older arrears" icon={<IconClock />} href={href({ tab: null })} />
        <StatCard
          label="Who hasn't paid"
          value={<span className="num">{owing.length}</span>}
          hint={`of ${leases.length} ${leases.length === 1 ? "tenant" : "tenants"}`}
          icon={<IconUsers />}
          href={href({ tab: null })}
        />
        <StatCard
          label="Vacant units"
          value={<span className="num">{vacant.length}</span>}
          hint={ready ? `${ready} ready to let` : `of ${units.length} units`}
          icon={<IconDoor />}
          href={buildingId ? `/buildings/${buildingId}` : "/buildings"}
        />
      </div>

      <Card>
        <CardHeader title="Collections" sub="Last 6 months" />
        <CollectionsChart data={chart} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
          <LinkTabs
            active={tab}
            tabs={[
              { key: "owing", label: <>Who hasn&apos;t paid <Count n={owing.length} /></>, href: href({ tab: null }) },
              { key: "inbox", label: <>Who paid this? <Count n={inbox.count} tone={inbox.count ? "accent" : "neutral"} /></>, href: href({ tab: "inbox" }) },
            ]}
          />
          {tab === "inbox" && inbox.count > inbox.events.length && (
            <ButtonLink href="/inbox" variant="secondary" size="sm">
              See all {inbox.count}
            </ButtonLink>
          )}
        </div>
        {tab === "owing" ? (
          owing.length ? (
            <OwingTable leases={owing} showBuilding={!buildingId && buildings.length > 1} />
          ) : (
            <EmptyState title="Everyone has paid" body="Nobody owes anything right now." />
          )
        ) : inbox.events.length ? (
          <InboxList
            compact
            events={inbox.events}
            leases={leases.map((l) => ({ leaseId: l.lease_id, label: `${l.unit_code} · ${l.tenant_name}`, buildingId: l.building_id }))}
          />
        ) : (
          <EmptyState title="Nothing to check" body="Every payment has been matched to a tenant." />
        )}
      </Card>
    </div>
  );
}
