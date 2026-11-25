import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBuildings, getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { PageTitle } from "@/ui";
import { BuildingSwitcher } from "../../_parts/building-switcher";
import { TenantImport } from "../../_parts/tenant-import";

export const metadata: Metadata = { title: "Add tenants" };

export default async function AddTenantsPage({ searchParams }: PageProps<"/units/add-tenants">) {
  const s = await requireOrg();
  const sp = await searchParams;
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);
  if (!buildings.length) redirect("/onboarding");
  const b = buildings.find((x) => x.id === sp.b) ?? buildings[0];
  const [units, leases] = await Promise.all([getUnits(db, s.org.orgId, b.id), getLeases(db, s.org.orgId, b.id)]);
  const unit = typeof sp.unit === "string" ? sp.unit : null;
  return (
    <div className="fade-in mx-auto max-w-3xl">
      <PageTitle back={{ href: "/units", label: "Units" }} sub={unit ? `Start with ${unit}, or add several at once.` : "Type them in, paste a list or upload an Excel file."}>
        Add tenants to {b.name}
      </PageTitle>
      {buildings.length > 1 && <BuildingSwitcher base="/units/add-tenants" buildings={buildings.map((x) => ({ id: x.id, name: x.name }))} active={b.id} all={false} />}
      <TenantImport
        key={b.id}
        buildingId={b.id}
        units={units.map((u) => ({ code: u.code, rent_cents: u.rent_cents }))}
        occupied={leases.map((l) => l.unit_code)}
        nextHref="/units"
      />
    </div>
  );
}
