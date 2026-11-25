import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { PLAN_LABEL } from "@/core/plans";
import { requireStaff, type AdminLandlord } from "@/server/admin";
import { Card, EmptyState, List, ListRow, PageTitle, StatCard } from "@/ui";

export const metadata: Metadata = { title: "Landlords" };

export default async function AdminLandlords() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("admin_landlords");
  const rows = (data ?? []) as AdminLandlord[];
  const units = rows.reduce((t, r) => t + r.units, 0);
  const tenants = rows.reduce((t, r) => t + r.tenants, 0);
  const collected = rows.reduce((t, r) => t + Number(r.collected_this_month_cents), 0);
  return (
    <>
      <PageTitle sub="Every account on RentFlow.">Landlords</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <StatCard label="Landlords" value={<span className="tnum">{rows.length}</span>} />
        <StatCard label="Units" value={<span className="tnum">{units}</span>} />
        <StatCard label="Tenants" value={<span className="tnum">{tenants}</span>} />
        <StatCard label="Rent tracked this month" value={<span className="money">{formatKES(collected)}</span>} />
      </div>
      <Card>
        {rows.length ? (
          <List>
            {rows.map((r) => (
              <ListRow
                key={r.org_id}
                title={r.name}
                sub={[r.owner_name ?? r.owner_email ?? "No owner", `${r.buildings} ${r.buildings === 1 ? "building" : "buildings"}`, `${r.units} units`, `${r.tenants} tenants`, `joined ${formatDate(r.created_at.slice(0, 10))}`].join(" · ")}
                end={
                  <>
                    <span className="text-[13px] font-medium">{PLAN_LABEL[r.plan]}</span>
                    <span className="text-[13px] text-muted">
                      owed <span className="money">{formatKES(Number(r.owed_cents))}</span>
                    </span>
                  </>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title="No landlords yet" />
        )}
      </Card>
    </>
  );
}
