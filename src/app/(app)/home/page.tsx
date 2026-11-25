import type { Metadata } from "next";
import Link from "next/link";
import { firstName, monthName } from "@/core/messages";
import { formatKES } from "@/core/money";
import { periodOf, todayNairobi } from "@/core/period";
import { getBuildings, getCollections, getInbox, getLeases, getPastTenants, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, CardTitle, Count, EmptyState, List, MoneyText, ProgressBar, StatCard, StatusPill, Tabs } from "@/ui";
import { CountUpMoney } from "@/ui/client";
import { BuildingSwitcher } from "../_parts/building-switcher";
import { RemindButton } from "../_parts/remind-button";
import { RentChart } from "../_parts/rent-chart";
import { StillOwedCard } from "../_parts/still-owed";
import { leaseStatus, tenantOptions } from "../_parts/status";
import { WhoPaidRows } from "../_parts/who-paid";

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
          title="No buildings yet"
          body="Add your building and tenants to start tracking rent. It takes about half an hour."
          action={<ButtonLink href="/onboarding">Add your building</ButtonLink>}
        />
      </Card>
    );
  }

  const buildingId = typeof sp.b === "string" && buildings.some((b) => b.id === sp.b) ? sp.b : null;
  const tab = sp.tab === "who-paid" ? "who-paid" : "not-paid";
  const [leases, units, chart, inbox, past] = await Promise.all([
    getLeases(db, s.org.orgId, buildingId),
    getUnits(db, s.org.orgId, buildingId),
    getCollections(db, s.org.orgId, buildingId, 6),
    getInbox(db, s.org.orgId, buildingId, 20),
    getPastTenants(db, s.org.orgId, { buildingId, owingOnly: true }),
  ]);

  const month = periodOf(todayNairobi());
  const collected = leases.reduce((t, l) => t + l.paid_this_month_cents, 0);
  const billed = chart.at(-1)?.billed || leases.reduce((t, l) => t + l.rent_cents, 0);
  const owing = leases.filter((l) => l.balance_cents > 0).sort((a, b) => b.balance_cents - a.balance_cents);
  const stillOwed = owing.reduce((t, l) => t + l.balance_cents, 0);
  const pastOwed = past.reduce((t, l) => t + l.balance_cents, 0);
  const empty = units.filter((u) => u.status !== "occupied").length;
  const pct = billed > 0 ? collected / billed : 0;
  const tenants = tenantOptions(leases, past);
  const q = (t: string | null) => {
    const p = new URLSearchParams();
    if (buildingId) p.set("b", buildingId);
    if (t) p.set("tab", t);
    const str = p.toString();
    return `/home${str ? `?${str}` : ""}`;
  };

  return (
    <div className="fade-in">
      <BuildingSwitcher base="/home" buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} active={buildingId} />
      <div className="mb-4">
        {s.name && <p className="text-[15px] text-muted">Hello, {firstName(s.name)}</p>}
        <h1 className="text-[20px] font-semibold">{monthName(month)} rent</h1>
      </div>

      <Card className="p-6">
        <p className="text-[28px] leading-tight sm:text-[32px]">
          <CountUpMoney cents={collected} />
          <span className="block text-[15px] text-muted sm:inline sm:text-[20px]"> of {formatKES(billed)} collected</span>
        </p>
        <div className="mt-5 flex items-center gap-4">
          <ProgressBar value={pct} label="Rent collected this month" />
          <span className="tnum text-[15px] font-semibold">{Math.round(pct * 100)}%</span>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-6">
        <div className="col-span-2 sm:col-span-1">
          <StillOwedCard current={stillOwed} past={pastOwed} pastCount={past.length} currentHref={q(null)} />
        </div>
        <StatCard label="Not paid" value={<span className="tnum">{owing.length}</span>} sub={owing.length === 1 ? "tenant" : "tenants"} href="/tenants?show=not-paid" />
        <StatCard label="Empty units" value={<span className="tnum">{empty}</span>} sub={`of ${units.length}`} href="/units" />
      </div>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="p-4 sm:p-6 sm:pb-4">
            <Tabs
              active={tab}
              tabs={[
                { key: "not-paid", label: <>Not paid yet <Count n={owing.length} /></>, href: q(null) },
                { key: "who-paid", label: <>Who paid this? <Count n={inbox.count} /></>, href: q("who-paid") },
              ]}
            />
          </div>
          {tab === "not-paid" ? (
            owing.length ? (
              <List>
                {owing.map((l) => (
                  <li key={l.lease_id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 sm:px-6">
                    <Link href={`/tenants/${l.lease_id}`} className="text-[15px] font-semibold">
                      {l.unit_code}
                    </Link>
                    <Link href={`/tenants/${l.lease_id}`} className="min-w-0 truncate text-[15px] font-medium hover:underline">
                      {l.tenant_name}
                    </Link>
                    <MoneyText cents={l.balance_cents} className="text-right text-[15px]" />
                    <span className="col-start-2 flex min-w-0 items-center gap-2">
                      <StatusPill status={leaseStatus(l)} />
                      {!buildingId && buildings.length > 1 && <span className="truncate text-[13px] text-muted">{l.building_name}</span>}
                    </span>
                    <span className="justify-self-end">
                      <RemindButton leaseId={l.lease_id} />
                    </span>
                  </li>
                ))}
              </List>
            ) : (
              <EmptyState title="Everyone has paid" body="No one owes rent right now." />
            )
          ) : inbox.events.length ? (
            <>
              <WhoPaidRows events={inbox.events} tenants={tenants} />
              {inbox.count > inbox.events.length && (
                <div className="border-t border-line p-4 text-center">
                  <ButtonLink href="/payments/who-paid" variant="ghost">
                    See all {inbox.count}
                  </ButtonLink>
                </div>
              )}
            </>
          ) : (
            <EmptyState title="Nothing to check" body="Every payment has been matched to a tenant." />
          )}
        </Card>

        <Card>
          <CardTitle sub="Last 6 months">Rent collected</CardTitle>
          <RentChart data={chart.map((c) => ({ period: c.period, collected: c.collected }))} />
        </Card>
      </div>
    </div>
  );
}
