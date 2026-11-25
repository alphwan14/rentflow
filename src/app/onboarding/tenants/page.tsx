import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantImport } from "@/app/(app)/_parts/tenant-import";
import { getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Step } from "../step";

export const metadata: Metadata = { title: "Add your tenants" };

export default async function OnboardingTenants({ searchParams }: PageProps<"/onboarding/tenants">) {
  const s = await requireOrg();
  const { b } = await searchParams;
  if (typeof b !== "string") notFound();
  const db = await supabaseServer();
  const { data: building } = await db.from("buildings").select("id, name").eq("id", b).eq("org_id", s.org.orgId).maybeSingle();
  if (!building) notFound();
  const [units, leases] = await Promise.all([getUnits(db, s.org.orgId, b), getLeases(db, s.org.orgId, b)]);
  return (
    <>
      <Step n={3} title="Add your tenants" sub="Paste the caretaker's list, use an Excel file or take a photo of the notebook. Include what each tenant owed before, if you know it." />
      <TenantImport
        buildingId={b}
        units={units.map((u) => ({ code: u.code, rent_cents: u.rent_cents }))}
        occupied={leases.map((l) => l.unit_code)}
        nextHref={`/onboarding/statement?b=${b}`}
        submitLabel="Save tenants"
      />
    </>
  );
}
