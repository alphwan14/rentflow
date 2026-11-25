import type { Metadata } from "next";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { PLAN_LABEL, UNIT_LIMIT } from "@/core/plans";
import { getBilling, requireStaff, type Billing } from "@/server/admin";
import { Card, EmptyState, FilterPills, List, ListRow, PageTitle, StatCard } from "@/ui";
import { BillingPill } from "../billing-pill";
import { PriceEditor } from "./price-editor";

export const metadata: Metadata = { title: "Plans & billing" };

const FILTERS: { key: "all" | Billing; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "trial", label: "Trial" },
  { key: "paid", label: "Paid" },
  { key: "free", label: "Free plan" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function AdminPlans({ searchParams }: PageProps<"/admin/plans">) {
  const { db } = await requireStaff();
  const sp = await searchParams;
  const show = FILTERS.some((f) => f.key === sp.show) ? (sp.show as "all" | Billing) : "all";
  const [rows, { data: prices }] = await Promise.all([getBilling(db), db.rpc("admin_plan_prices")]);
  const price = (plan: string) => Number(((prices ?? []) as { plan: string; price_per_unit_cents: number }[]).find((p) => p.plan === plan)?.price_per_unit_cents ?? 0);
  const count = (b: Billing) => rows.filter((r) => r.billing === b).length;
  const income = rows.filter((r) => r.billing === "paid").reduce((t, r) => t + r.monthly_cents, 0);
  const atRisk = rows.filter((r) => r.billing === "overdue").reduce((t, r) => t + r.monthly_cents, 0);
  const shown = show === "all" ? rows : rows.filter((r) => r.billing === show);
  const order: Record<Billing, number> = { overdue: 0, trial: 1, paid: 2, free: 3, cancelled: 4 };

  return (
    <>
      <PageTitle sub="Who is on which plan, and who has paid RentFlow. Payments are recorded by hand until billing is built.">Plans &amp; billing</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <StatCard label="Paying" value={<span className="tnum">{count("paid")}</span>} sub={`${formatKES(income)} a month`} />
        <StatCard label="On trial" value={<span className="tnum">{count("trial")}</span>} />
        <StatCard label="Overdue" value={<span className="tnum">{count("overdue")}</span>} sub={atRisk ? `${formatKES(atRisk)} a month at risk` : undefined} href="/admin/plans?show=overdue" />
        <StatCard label="Free plan" value={<span className="tnum">{count("free")}</span>} sub={`up to ${UNIT_LIMIT.free} units`} />
      </div>

      <Card className="mb-6 p-6">
        <h2 className="text-[15px] font-semibold">Price per unit, per month</h2>
        <p className="mb-4 text-[15px] text-muted">A landlord pays this for every unit they track. You can give one landlord a special price on their page.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceEditor plan="growth" cents={price("growth")} />
          <PriceEditor plan="pro" cents={price("pro")} />
        </div>
      </Card>

      <div className="mb-4">
        <FilterPills
          active={show}
          items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "all" ? "/admin/plans" : `/admin/plans?show=${f.key}`, count: f.key === "all" ? rows.length : count(f.key) }))}
        />
      </div>
      <Card>
        {shown.length ? (
          <List>
            {[...shown]
              .sort((a, b) => order[a.billing] - order[b.billing] || a.name.localeCompare(b.name))
              .map((r) => (
                <ListRow
                  key={r.org_id}
                  href={`/admin/billing/${r.org_id}`}
                  title={r.name}
                  sub={[
                    `${PLAN_LABEL[r.plan]} · ${r.units} units`,
                    r.billing === "paid" && r.paid_until ? `paid up to ${formatDate(r.paid_until)}` : null,
                    r.billing === "trial" && r.trial_ends ? `trial ends ${formatDate(r.trial_ends)}` : null,
                    r.billing === "overdue" ? (r.paid_until ? `was paid up to ${formatDate(r.paid_until)}` : r.trial_ends ? `trial ended ${formatDate(r.trial_ends)}` : "never paid") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  end={
                    <>
                      <BillingPill billing={r.billing} />
                      {r.plan !== "free" && <span className="money text-[13px] text-muted">{formatKES(r.monthly_cents)}/mo</span>}
                    </>
                  }
                />
              ))}
          </List>
        ) : (
          <EmptyState title="No landlords here" />
        )}
      </Card>
    </>
  );
}
