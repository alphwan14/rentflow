import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { PageHeader } from "@/ui";
import { TenantImport } from "../../tenant-import";

export const metadata: Metadata = { title: "Add tenants" };

export default async function ImportPage({ params }: PageProps<"/buildings/[id]/import">) {
  const s = await requireOrg();
  const { id } = await params;
  const db = await supabaseServer();
  const { data: b } = await db.from("buildings").select("id, name").eq("id", id).eq("org_id", s.org.orgId).maybeSingle();
  if (!b) notFound();
  const [units, leases] = await Promise.all([getUnits(db, s.org.orgId, id), getLeases(db, s.org.orgId, id)]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Add tenants to ${b.name}`} sub="Paste a list, upload a spreadsheet or snap the caretaker's notebook." />
      <TenantImport
        buildingId={id}
        units={units.map((u) => ({ code: u.code, rent_cents: u.rent_cents }))}
        occupied={leases.map((l) => l.unit_code)}
        nextHref={`/buildings/${id}`}
      />
    </div>
  );
}
