import type { Metadata } from "next";
import { PLAN_LABEL, UNIT_LIMIT, type Plan } from "@/core/plans";
import { requireStaff, type AdminLandlord } from "@/server/admin";
import { Card, EmptyState, PageTitle, StatCard } from "@/ui";
import { PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Plans" };

export default async function AdminPlans() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("admin_landlords");
  const rows = (data ?? []) as AdminLandlord[];
  const count = (p: Plan) => rows.filter((r) => r.plan === p).length;
  return (
    <>
      <PageTitle sub="Move a landlord to another plan. Billing comes later.">Plans</PageTitle>
      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-6">
        {(["free", "growth", "pro"] as Plan[]).map((p) => (
          <StatCard key={p} label={PLAN_LABEL[p]} value={<span className="tnum">{count(p)}</span>} sub={p === "free" ? "up to 10 units" : "per unit"} />
        ))}
      </div>
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const limit = UNIT_LIMIT[r.plan];
              const over = limit !== null && r.units > limit;
              return (
                <li key={r.org_id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{r.name}</div>
                    <div className={`text-[13px] ${over ? "text-unpaid" : "text-muted"}`}>
                      {r.units} units{over ? ` (over the ${limit}-unit limit)` : ""}
                    </div>
                  </div>
                  <PlanPicker orgId={r.org_id} plan={r.plan} name={r.name} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No landlords yet" />
        )}
      </Card>
    </>
  );
}
