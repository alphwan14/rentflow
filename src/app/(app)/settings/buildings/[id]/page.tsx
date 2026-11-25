import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBuildings } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { PageTitle } from "@/ui";
import { BuildingSettings } from "../../../_parts/building-settings";

export const metadata: Metadata = { title: "Building settings" };

export default async function BuildingSettingsPage({ params }: PageProps<"/settings/buildings/[id]">) {
  const s = await requireOrg();
  const { id } = await params;
  const db = await supabaseServer();
  const b = (await getBuildings(db, s.org.orgId)).find((x) => x.id === id);
  if (!b) notFound();
  return (
    <div className="fade-in mx-auto max-w-3xl">
      <PageTitle back={{ href: "/settings", label: "Settings" }}>{b.name}</PageTitle>
      <BuildingSettings building={b} plan={s.org.plan} />
    </div>
  );
}
