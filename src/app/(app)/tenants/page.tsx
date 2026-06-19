import Link from "next/link";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { presentStatus } from "@/lib/ledger/present";
import type { DashboardTenant } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const supabase = await createClient();
  await supabase.rpc("sync_org_charges");
  const { data: rows } = await supabase.rpc("dashboard_tenants");
  const tenants = (rows ?? []) as DashboardTenant[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Tenants</h1>
        <Link
          href="/tenants/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-teal-800"
        >
          + Add tenant
        </Link>
      </div>

      {tenants.length === 0 ? (
        <Card className="px-4 py-12 text-center text-sm text-slate-500">No tenants yet.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tenants.map((t) => {
            const view = presentStatus({
              arrears: t.arrears,
              credit: t.credit,
              coveredUntil: t.covered_until,
              overdueDays: t.overdue_days,
              hasCharges: t.balance !== 0 || t.covered_until !== null,
            });
            return (
              <Link key={t.tenant_id} href={`/tenants/${t.tenant_id}`}>
                <Card className="p-4 transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{t.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {t.unit_label ? `Room ${t.unit_label} · ` : ""}
                        {formatMoney(t.monthly_rent_cents)}/mo
                      </p>
                    </div>
                    <StatusBadge status={view} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{view.detail}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
