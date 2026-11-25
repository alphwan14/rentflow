import type { Metadata } from "next";
import { ORG_ID as DEMO_ORG_ID } from "@/demo/data";
import { getBuildings } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, PageTitle } from "@/ui";
import { UploadForm } from "../../_parts/upload-form";

export const metadata: Metadata = { title: "Upload M-Pesa statement" };

export default async function UploadPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);
  return (
    <div className="fade-in mx-auto max-w-2xl">
      <PageTitle back={{ href: "/payments", label: "Payments" }} sub="RentFlow matches every payment to a tenant. Payments it has seen before are skipped.">
        Upload M-Pesa statement
      </PageTitle>
      {buildings.length ? (
        <UploadForm buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} />
      ) : (
        <Card>
          <EmptyState title="Add your building first" body="RentFlow needs your units and tenants to know who paid." action={<ButtonLink href="/onboarding">Add your building</ButtonLink>} />
        </Card>
      )}
      {s.org.orgId === DEMO_ORG_ID && (
        <p className="mt-4 text-center text-[13px] text-muted">
          Trying the demo?{" "}
          <a href="/payments/sample" download className="text-accent underline-offset-4 hover:underline">
            Download a sample statement
          </a>
        </p>
      )}
    </div>
  );
}
