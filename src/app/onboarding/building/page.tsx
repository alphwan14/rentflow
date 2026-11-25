import type { Metadata } from "next";
import { requireOrg } from "@/server/session";
import { BuildingForm } from "@/app/(app)/buildings/building-form";
import { Steps } from "../steps";

export const metadata: Metadata = { title: "Set up a building" };

export default async function OnboardingBuilding() {
  const s = await requireOrg();
  return (
    <>
      <Steps current={1} />
      <h1 className="text-[24px] font-semibold tracking-tight">The building</h1>
      <p className="mt-1 text-[15px] text-muted">Name it, say how tenants pay, and describe the units. You can change all of this later.</p>
      <BuildingForm onboarding plan={s.org.plan} />
    </>
  );
}
