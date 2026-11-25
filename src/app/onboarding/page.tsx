import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { CreateOrgForm } from "./create-org-form";
import { Steps } from "./steps";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingStart({ searchParams }: PageProps<"/onboarding">) {
  const s = await getSession();
  const { new: fresh } = await searchParams;
  if (s?.org && !fresh) redirect("/onboarding/building");
  return (
    <>
      <Steps current={0} />
      <h1 className="text-[24px] font-semibold tracking-tight">Whose rent are we tracking?</h1>
      <p className="mt-1 text-[15px] text-muted">The landlord or company the buildings belong to. You can invite the landlord later.</p>
      <CreateOrgForm defaultName={s?.name ?? ""} />
    </>
  );
}
