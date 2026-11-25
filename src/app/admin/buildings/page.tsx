import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { requireStaff, type AdminBuilding } from "@/server/admin";
import { PLAN_LABEL } from "@/core/plans";
import { Card, EmptyState, List, ListRow, PageTitle } from "@/ui";
import { BillingPill } from "../billing-pill";

export const metadata: Metadata = { title: "Buildings" };

export default async function AdminBuildings() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("admin_buildings");
  const rows = (data ?? []) as AdminBuilding[];
  return (
    <>
      <PageTitle sub={`${rows.length} buildings across all landlords.`}>Buildings</PageTitle>
      <Card>
        {rows.length ? (
          <List>
            {rows.map((b) => (
              <ListRow
                key={b.building_id}
                href={`/admin/billing/${b.org_id}`}
                title={b.name}
                sub={[b.org_name, b.location, b.last_upload_at ? `last statement ${formatDate(b.last_upload_at.slice(0, 10))}` : "no statement yet"].filter(Boolean).join(" · ")}
                end={
                  <>
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{PLAN_LABEL[b.plan]}</span>
                      <BillingPill billing={b.billing} />
                    </span>
                    <span className="tnum text-[13px]">
                      {b.filled} of {b.units} filled
                    </span>
                    <span className="text-[13px] text-muted">
                      owed <span className="money">{formatKES(Number(b.owed_cents))}</span>
                    </span>
                  </>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title="No buildings yet" />
        )}
      </Card>
    </>
  );
}
