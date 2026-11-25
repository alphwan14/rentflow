import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { requireStaff, type AdminBuilding } from "@/server/admin";
import { Card, EmptyState, List, ListRow, PageTitle } from "@/ui";

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
                title={b.name}
                sub={[b.org_name, b.location, b.last_upload_at ? `last statement ${formatDate(b.last_upload_at.slice(0, 10))}` : "no statement yet"].filter(Boolean).join(" · ")}
                end={
                  <>
                    <span className="tnum text-[13px] font-medium">
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
