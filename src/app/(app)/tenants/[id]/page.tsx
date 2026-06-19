import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { presentStatus } from "@/lib/ledger/present";
import { formatPeriod, periodFromDate } from "@/lib/ledger/period";
import { withRunningBalance } from "@/lib/ledger/timeline";
import type { LedgerEntry, Receipt, Tenant, TenantFinancials } from "@/lib/supabase/types";
import { RecordPaymentForm } from "./record-payment-form";

export const dynamic = "force-dynamic";

const ENTRY_LABEL: Record<LedgerEntry["entry_type"], string> = {
  charge: "Rent charged",
  payment: "Payment received",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

export default async function TenantProfilePage({
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

  const [{ data: finRows }, { data: unit }, { data: ledgerRows }, { data: receiptRows }] =
    await Promise.all([
      supabase.rpc("tenant_financials", { p_tenant: id }),
      t.unit_id
        ? supabase.from("rental_units").select("label").eq("id", t.unit_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("ledger_entries").select("*").eq("tenant_id", id).order("occurred_at", { ascending: true }),
      supabase.from("receipts").select("*").order("created_at", { ascending: false }),
    ]);

  const fin = (Array.isArray(finRows) ? finRows[0] : finRows) as TenantFinancials | undefined;
  const ledger = (ledgerRows ?? []) as LedgerEntry[];
  // Receipts are org-scoped by RLS; keep only this tenant's (by ledger payment ids).
  const paymentIds = new Set(ledger.filter((e) => e.entry_type === "payment").map((e) => e.source_id));
  const receipts = ((receiptRows ?? []) as Receipt[]).filter((r) => paymentIds.has(r.payment_id));

  const view = presentStatus({
    arrears: fin?.arrears ?? 0,
    credit: fin?.credit ?? 0,
    coveredUntil: fin?.covered_until ?? null,
    overdueDays: fin?.overdue_days ?? 0,
    hasCharges: ledger.length > 0,
  });

  // Running balance, computed oldest -> newest, then shown newest-first.
  const timeline = withRunningBalance(ledger).reverse();

  const now = new Date();
  const today = `${periodFromDate(now)}-${String(now.getDate()).padStart(2, "0")}`;
  const coveredPeriod = fin?.covered_until ? fin.covered_until.slice(0, 7) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{t.full_name}</h1>
            <StatusBadge status={view} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {unit?.label ? `Room ${unit.label} · ` : ""}
            {formatMoney(t.monthly_rent_cents)}/mo · due day {t.due_day}
            {t.phone ? ` · ${t.phone}` : ""}
          </p>
        </div>
        <Link
          href={`/tenants/${id}/statement`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Statement
        </Link>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {(fin?.arrears ?? 0) > 0 ? "Balance due" : "Balance"}
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${(fin?.arrears ?? 0) > 0 ? "text-red-600" : "text-slate-900"}`}
          >
            {formatMoney(fin?.arrears ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Credit</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(fin?.credit ?? 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Covered until</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {coveredPeriod ? formatPeriod(coveredPeriod) : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
          <p className="mt-1 text-sm font-medium text-slate-700">{view.detail}</p>
        </Card>
      </div>

      {/* Record payment */}
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Record payment</h2>
        <RecordPaymentForm tenantId={id} today={today} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Ledger timeline */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Ledger</h2>
          </div>
          {timeline.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No activity yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timeline.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 text-slate-500">
                      {new Date(e.occurred_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{ENTRY_LABEL[e.entry_type]}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${e.amount_cents < 0 ? "text-emerald-600" : "text-slate-900"}`}
                    >
                      {e.amount_cents < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(e.amount_cents), { withSymbol: false })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                      {formatMoney(e.balanceAfter, { withSymbol: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Receipts */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Receipts</h2>
          </div>
          {receipts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No receipts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {receipts.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/receipts/${r.payment_id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-mono text-xs text-slate-500">{r.receipt_no}</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatMoney(r.snapshot.amount_cents)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(r.snapshot.paid_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
