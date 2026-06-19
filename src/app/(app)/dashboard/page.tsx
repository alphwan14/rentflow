import Link from "next/link";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { presentStatus } from "@/lib/ledger/present";
import { periodFromDate } from "@/lib/ledger/period";
import type { DashboardTenant } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Keep charges current (lazy backfill), then read the tenant list in one shot.
  await supabase.rpc("sync_org_charges");
  const { data: rows } = await supabase.rpc("dashboard_tenants");
  const tenants = (rows ?? []) as DashboardTenant[];

  // Collected this month.
  const monthStart = `${periodFromDate(new Date())}-01`;
  const { data: monthPayments } = await supabase
    .from("payments")
    .select("amount_cents")
    .gte("paid_at", monthStart);
  const collected = (monthPayments ?? []).reduce((s, p) => s + (p.amount_cents as number), 0);

  const active = tenants.filter((t) => t.status === "active");
  const expected = active.reduce((s, t) => s + t.monthly_rent_cents, 0);
  const outstanding = tenants.reduce((s, t) => s + t.arrears, 0);

  const views = tenants.map((t) => ({
    t,
    view: presentStatus({
      arrears: t.arrears,
      credit: t.credit,
      coveredUntil: t.covered_until,
      overdueDays: t.overdue_days,
      hasCharges: t.balance !== 0 || t.covered_until !== null,
    }),
  }));
  const overdueCount = views.filter((v) => v.view.tone === "bad").length;
  const advanceCount = views.filter((v) => v.view.label === "Advance").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <Link
          href="/tenants/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-teal-800"
        >
          + Add tenant
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Expected / month" value={formatMoney(expected)} sub={`${active.length} active`} />
        <StatCard label="Collected this month" value={formatMoney(collected)} />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} />
        <StatCard label="Overdue" value={String(overdueCount)} sub="tenants" />
        <StatCard label="Advance paid" value={String(advanceCount)} sub="tenants" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Tenants</h2>
        </div>
        {views.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            No tenants yet.{" "}
            <Link href="/tenants/new" className="font-medium text-brand hover:underline">
              Add your first tenant
            </Link>
            .
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {views.map(({ t, view }) => (
              <li key={t.tenant_id}>
                <Link
                  href={`/tenants/${t.tenant_id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="w-14 shrink-0 text-sm font-semibold text-slate-500">
                    {t.unit_label ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{t.full_name}</p>
                    <p className="truncate text-xs text-slate-500">{view.detail}</p>
                  </div>
                  <StatusBadge status={view} />
                  <div className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {t.arrears > 0
                      ? formatMoney(t.arrears)
                      : t.credit > 0
                        ? `+${formatMoney(t.credit, { withSymbol: false })}`
                        : formatMoney(0)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
