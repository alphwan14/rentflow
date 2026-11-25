import type { Metadata } from "next";
import { getInbox, getLeases } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Card, EmptyState, PageHeader } from "@/ui";
import { InboxList } from "./inbox-list";
import { RematchButton } from "./rematch-button";

export const metadata: Metadata = { title: "Who paid this?" };

export default async function InboxPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [inbox, leases] = await Promise.all([getInbox(db, s.org.orgId, null, 200), getLeases(db, s.org.orgId)]);
  return (
    <div>
      <PageHeader
        title="Who paid this?"
        sub="Payments RentFlow couldn't match for sure. Confirm the best guess in one tap and RentFlow will remember the payer next time."
        action={inbox.count > 0 ? <RematchButton /> : null}
      />
      <Card>
        {inbox.events.length ? (
          <div className="pt-2">
            <InboxList
              events={inbox.events}
              leases={leases.map((l) => ({ leaseId: l.lease_id, label: `${l.unit_code} · ${l.tenant_name}`, buildingId: l.building_id }))}
            />
          </div>
        ) : (
          <EmptyState title="All clear" body="Every payment has been matched to a tenant." />
        )}
      </Card>
    </div>
  );
}
