import type { Metadata } from "next";
import Link from "next/link";
import { UploadForm } from "@/app/(app)/_parts/upload-form";
import { getBuildings } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Step } from "../step";

export const metadata: Metadata = { title: "Upload your M-Pesa statement" };

export default async function OnboardingStatement({ searchParams }: PageProps<"/onboarding/statement">) {
  const s = await requireOrg();
  const { b } = await searchParams;
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);
  return (
    <>
      <Step n={4} title="Upload your M-Pesa statement" sub="The last 3 months is best. RentFlow matches each payment to a tenant and works out who owes what." />
      <UploadForm onboarding buildings={buildings.map((x) => ({ id: x.id, name: x.name }))} defaultBuilding={typeof b === "string" ? b : null} />
      <p className="mt-6 text-center text-[15px] text-muted">
        No statement with you?{" "}
        <Link href={typeof b === "string" ? `/onboarding/done?b=${b}` : "/home"} className="font-medium text-accent">
          Skip for now
        </Link>
      </p>
    </>
  );
}
