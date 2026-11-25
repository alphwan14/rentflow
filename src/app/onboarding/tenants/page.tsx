import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantImport } from "@/app/(app)/buildings/tenant-import";
import { getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Steps } from "../steps";

export const metadata: Metadata = { title: "Import tenants" };

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
      <Steps current={2} />
      <h1 className="text-[24px] font-semibold tracking-tight">Who lives at {building.name}?</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">
        Paste the caretaker&apos;s list, upload a spreadsheet or snap the notebook. Include what each tenant owed before, if you know it.
      </p>
      <TenantImport
        buildingId={b}
        units={units.map((u) => ({ code: u.code, rent_cents: u.rent_cents }))}
        occupied={leases.map((l) => l.unit_code)}
        nextHref={`/onboarding/statement?b=${b}`}
      />
    </>
  );
}
