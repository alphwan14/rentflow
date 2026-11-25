import type { Metadata } from "next";
import { formatDate } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { getBuildings, getLeases, getPastTenants } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, FilterPills, List, ListRow, MoneyText, PageTitle, StatusPill, inputClass } from "@/ui";
import { leaseStatus } from "../_parts/status";

export const metadata: Metadata = { title: "Tenants" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "not-paid", label: "Not paid" },
  { key: "part-paid", label: "Part paid" },
  { key: "paid", label: "Paid" },
  { key: "moved-out", label: "Moved out" },
] as const;

export default async function TenantsPage({ searchParams }: PageProps<"/tenants">) {
  const s = await requireOrg();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const show = FILTERS.some((f) => f.key === sp.show) ? (sp.show as string) : "all";
  const db = await supabaseServer();
  const [leases, buildings, past] = await Promise.all([getLeases(db, s.org.orgId), getBuildings(db, s.org.orgId), getPastTenants(db, s.org.orgId)]);

  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  const matches = (l: (typeof leases)[number]) =>
    !q || l.tenant_name.toLowerCase().includes(q) || l.unit_code.toLowerCase().includes(q) || (digits.length >= 3 && l.phones.some((p) => p.includes(digits)));
  const searched = leases.filter(matches);
  // Past tenants: those who still owe first.
  const pastShown = past.filter(matches).sort((a, b) => Math.max(0, b.balance_cents) - Math.max(0, a.balance_cents));
  const groups = {
    all: searched,
    "not-paid": searched.filter((l) => leaseStatus(l) === "unpaid"),
    "part-paid": searched.filter((l) => leaseStatus(l) === "partial"),
    paid: searched.filter((l) => leaseStatus(l) === "paid" || leaseStatus(l) === "ahead"),
    "moved-out": pastShown,
  } as Record<string, typeof leases>;
  const shown = groups[show];
  const href = (k: string) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (k !== "all") p.set("show", k);
    const str = p.toString();
    return `/tenants${str ? `?${str}` : ""}`;
  };

  return (
    <div className="fade-in">
      <PageTitle sub={`${leases.length} ${leases.length === 1 ? "tenant" : "tenants"}`} action={<ButtonLink href="/units/add-tenants" variant="secondary">Add tenants</ButtonLink>}>
        Tenants
      </PageTitle>
      <form role="search" className="mb-4">
        <label htmlFor="q" className="sr-only">
          Search tenants
        </label>
        <input id="q" name="q" type="search" defaultValue={query} placeholder="Search name, unit or phone" className={inputClass} />
        {show !== "all" && <input type="hidden" name="show" value={show} />}
      </form>
      <div className="mb-4">
        <FilterPills active={show} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href(f.key), count: groups[f.key].length }))} />
      </div>
      <Card>
        {shown.length ? (
          <List>
            {shown.map((l) => (
              <ListRow
                key={l.lease_id}
                href={`/tenants/${l.lease_id}`}
                lead={l.unit_code}
                title={l.tenant_name}
                sub={[
                  l.status === "ended" ? `Moved out${l.end_date ? ` ${formatDate(l.end_date)}` : ""}` : null,
                  l.phones[0] ? formatPhone(l.phones[0]) : "No phone",
                  buildings.length > 1 ? l.building_name : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                end={
                  <>
                    {l.balance_cents !== 0 && <MoneyText cents={l.balance_cents} className="text-[15px]" />}
                    <StatusPill status={leaseStatus(l)} />
                  </>
                }
              />
            ))}
          </List>
        ) : show === "moved-out" && !q ? (
          <EmptyState title="No past tenants" body="When someone moves out, they show here, along with anything they still owe." />
        ) : leases.length ? (
          <EmptyState title="No tenants match" body="Try another name, unit or phone number." action={<ButtonLink href="/tenants" variant="secondary">Show everyone</ButtonLink>} />
        ) : (
          <EmptyState title="No tenants yet" body="Add your tenants to start tracking rent." action={<ButtonLink href="/units/add-tenants">Add tenants</ButtonLink>} />
        )}
      </Card>
    </div>
  );
}
