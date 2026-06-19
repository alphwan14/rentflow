import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { formatPeriod } from "@/lib/ledger/period";
import { withRunningBalance } from "@/lib/ledger/timeline";
import type { LedgerEntry, Org, Tenant, TenantFinancials } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ENTRY_LABEL: Record<LedgerEntry["entry_type"], string> = {
  charge: "Rent charged",
  payment: "Payment received",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

export default async function StatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  await supabase.rpc("sync_charges", { p_tenant: id });

  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) notFound();
  const t = tenant as Tenant;

  const [{ data: orgRow }, { data: unit }, { data: finRows }, { data: ledgerRows }] =
    await Promise.all([
      supabase.from("orgs").select("*").maybeSingle(),
      t.unit_id
        ? supabase.from("rental_units").select("label").eq("id", t.unit_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("tenant_financials", { p_tenant: id }),
      supabase.from("ledger_entries").select("*").eq("tenant_id", id).order("occurred_at", { ascending: true }),
    ]);

  const org = orgRow as Org | null;
  const fin = (Array.isArray(finRows) ? finRows[0] : finRows) as TenantFinancials | undefined;
  const ledger = (ledgerRows ?? []) as LedgerEntry[];

  const rows = withRunningBalance(ledger);

  const coveredPeriod = fin?.covered_until ? fin.covered_until.slice(0, 7) : null;
  const generatedOn = new Date().toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/tenants/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Back to tenant
        </Link>
        <PrintButton label="Print statement" />
      </div>

      <Card className="print-area p-8">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <Brand size="lg" />
            {org?.name ? <p className="mt-1 text-sm text-slate-500">{org.name}</p> : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-slate-900">Account Statement</p>
            <p className="text-slate-400">Generated {generatedOn}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Tenant</p>
            <p className="font-medium text-slate-900">{t.full_name}</p>
            {unit?.label ? <p className="text-slate-500">Room {unit.label}</p> : null}
            {t.phone ? <p className="text-slate-500">{t.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Monthly rent</p>
            <p className="font-medium text-slate-900">{formatMoney(t.monthly_rent_cents)}</p>
            {coveredPeriod ? (
              <p className="mt-1 text-slate-500">Covered until {formatPeriod(coveredPeriod)}</p>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Event</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="py-2 text-slate-500">
                  {new Date(e.occurred_at).toLocaleDateString("en-KE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="py-2 text-slate-700">{ENTRY_LABEL[e.entry_type]}</td>
                <td className="py-2 text-right tabular-nums text-slate-900">
                  {e.amount_cents < 0 ? "−" : "+"}
                  {formatMoney(Math.abs(e.amount_cents), { withSymbol: false })}
                </td>
                <td className="py-2 text-right font-medium tabular-nums text-slate-900">
                  {formatMoney(e.balanceAfter, { withSymbol: false })}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No activity.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Current balance</span>
              <span className="font-semibold text-slate-900">{formatMoney(fin?.arrears ?? 0)}</span>
            </div>
            {(fin?.credit ?? 0) > 0 ? (
              <div className="flex justify-between">
                <span className="text-slate-500">Credit balance</span>
                <span className="font-semibold text-slate-900">{formatMoney(fin?.credit ?? 0)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
