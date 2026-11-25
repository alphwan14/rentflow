import type { Metadata } from "next";
import Link from "next/link";
import { formatPhone } from "@/core/phone";
import { getBuildings, getLeases } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Card, EmptyState, Money, PageHeader, StatusBadge, inputClass } from "@/ui";
import { IconChevronRight } from "@/ui/icons";
import { leaseStatus } from "../owing-table";

export const metadata: Metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }: PageProps<"/tenants">) {
  const s = await requireOrg();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";
  const db = await supabaseServer();
  const [leases, buildings] = await Promise.all([getLeases(db, s.org.orgId), getBuildings(db, s.org.orgId)]);
  const digits = query.replace(/\D/g, "");
  const shown = query
    ? leases.filter(
        (l) =>
          l.tenant_name.toLowerCase().includes(query) ||
          l.unit_code.toLowerCase().includes(query) ||
          (digits.length >= 3 && l.phones.some((p) => p.includes(digits.replace(/^0/, "")))),
      )
    : leases;

  return (
    <div>
      <PageHeader title="Tenants" sub={`${leases.length} active tenancies`} />
      <form className="mb-4" role="search">
        <input name="q" defaultValue={typeof q === "string" ? q : ""} placeholder="Search by name, unit or phone" className={inputClass} />
      </form>
      <Card>
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((l) => (
              <li key={l.lease_id}>
                <Link href={`/tenants/${l.lease_id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-page/50">
                  <span className="w-12 shrink-0 font-semibold">{l.unit_code}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{l.tenant_name}</div>
                    <div className="truncate text-[12px] text-muted">
                      {[buildings.length > 1 ? l.building_name : null, l.phones[0] ? formatPhone(l.phones[0]) : "No phone"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <StatusBadge status={leaseStatus(l)} />
                  </div>
                  <Money cents={l.balance_cents} className="w-28 text-right text-[14px] font-semibold" />
                  <IconChevronRight size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={query ? "No tenant matches that" : "No tenants yet"} />
        )}
      </Card>
    </div>
  );
}
