import type { Metadata } from "next";
import { requireOrg } from "@/server/session";
import { PageHeader } from "@/ui";
import { BuildingForm } from "../building-form";

export const metadata: Metadata = { title: "Add building" };

export default async function NewBuildingPage() {
  const s = await requireOrg();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add a building" />
      <BuildingForm plan={s.org.plan} />
    </div>
  );
}
