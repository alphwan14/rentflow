import type { Metadata } from "next";
import { getInbox, getLeases } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, PageTitle } from "@/ui";
import { WhoPaidCards } from "../../_parts/who-paid";

export const metadata: Metadata = { title: "Who paid this?" };

export default async function WhoPaidPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [inbox, leases] = await Promise.all([getInbox(db, s.org.orgId, null, 200), getLeases(db, s.org.orgId)]);
  return (
    <div className="fade-in mx-auto max-w-2xl">
      <PageTitle back={{ href: "/payments", label: "Payments" }} sub="RentFlow wasn't sure who sent these. Tell it once and it remembers the payer next time.">
        Who paid this?
      </PageTitle>
      {inbox.events.length ? (
        <WhoPaidCards events={inbox.events} tenants={leases.map((l) => ({ leaseId: l.lease_id, unitCode: l.unit_code, name: l.tenant_name, buildingId: l.building_id }))} />
      ) : (
        <Card>
          <EmptyState title="All done" body="Every payment is matched to a tenant." action={<ButtonLink href="/home">Go to home</ButtonLink>} />
        </Card>
      )}
    </div>
  );
}
