import type { Metadata } from "next";
import { formatPhone } from "@/core/phone";
import { getBuildings, getLeases } from "@/server/queries";
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
] as const;

export default async function TenantsPage({ searchParams }: PageProps<"/tenants">) {
  const s = await requireOrg();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const show = FILTERS.some((f) => f.key === sp.show) ? (sp.show as string) : "all";
  const db = await supabaseServer();
  const [leases, buildings] = await Promise.all([getLeases(db, s.org.orgId), getBuildings(db, s.org.orgId)]);

  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  const searched = q
    ? leases.filter(
        (l) => l.tenant_name.toLowerCase().includes(q) || l.unit_code.toLowerCase() === q || l.unit_code.toLowerCase().includes(q) || (digits.length >= 3 && l.phones.some((p) => p.includes(digits))),
      )
    : leases;
  const groups = {
    all: searched,
    "not-paid": searched.filter((l) => leaseStatus(l) === "unpaid"),
    "part-paid": searched.filter((l) => leaseStatus(l) === "partial"),
    paid: searched.filter((l) => leaseStatus(l) === "paid" || leaseStatus(l) === "ahead"),
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
                sub={[l.phones[0] ? formatPhone(l.phones[0]) : "No phone", buildings.length > 1 ? l.building_name : null].filter(Boolean).join(" · ")}
                end={
                  <>
                    {l.balance_cents !== 0 && <MoneyText cents={l.balance_cents} className="text-[15px]" />}
                    <StatusPill status={leaseStatus(l)} />
                  </>
                }
              />
            ))}
          </List>
        ) : leases.length ? (
          <EmptyState title="No tenants match" body="Try another name, unit or phone number." action={<ButtonLink href="/tenants" variant="secondary">Show everyone</ButtonLink>} />
        ) : (
          <EmptyState title="No tenants yet" body="Add your tenants to start tracking rent." action={<ButtonLink href="/units/add-tenants">Add tenants</ButtonLink>} />
        )}
      </Card>
    </div>
  );
}
