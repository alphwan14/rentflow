import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { AddUnitsForm } from "../forms";
import { Step } from "../step";

export const metadata: Metadata = { title: "Add your units" };

export default async function OnboardingUnits({ searchParams }: PageProps<"/onboarding/units">) {
  const s = await requireOrg();
  const { b } = await searchParams;
  if (typeof b !== "string") notFound();
  const db = await supabaseServer();
  const { data: building } = await db.from("buildings").select("id, name").eq("id", b).eq("org_id", s.org.orgId).maybeSingle();
  if (!building) notFound();
  return (
    <>
      <Step n={2} title="Add your units" sub={`The door numbers at ${building.name} and the usual rent.`} />
      <AddUnitsForm buildingId={b} plan={s.org.plan} />
    </>
  );
}
