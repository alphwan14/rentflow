import type { Metadata } from "next";
import Link from "next/link";
import { UploadForm } from "@/app/(app)/statements/upload-form";
import { getBuildings } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Steps } from "../steps";

export const metadata: Metadata = { title: "Upload statements" };

export default async function OnboardingStatement({ searchParams }: PageProps<"/onboarding/statement">) {
  const s = await requireOrg();
  const { b } = await searchParams;
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);
  return (
    <>
      <Steps current={3} />
      <h1 className="text-[24px] font-semibold tracking-tight">Upload the last 3 months of M-Pesa statements</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">
        RentFlow matches every payment to a tenant, learns their phone numbers and works out exactly who owes what.
      </p>
      <UploadForm onboarding buildings={buildings.map((x) => ({ id: x.id, name: x.name }))} defaultBuilding={typeof b === "string" ? b : null} />
      <p className="mt-4 text-center text-[13px] text-muted">
        No statement to hand?{" "}
        <Link href="/home" className="font-medium text-accent">
          Skip for now
        </Link>
      </p>
    </>
  );
}
