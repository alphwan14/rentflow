import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import type { Org, Receipt } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const supabase = await createClient();

  const { data: receiptRow } = await supabase
    .from("receipts")
    .select("*")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (!receiptRow) notFound();
  const receipt = receiptRow as Receipt;
  const s = receipt.snapshot;

  const [{ data: orgRow }, { data: payment }] = await Promise.all([
    supabase.from("orgs").select("*").maybeSingle(),
    supabase.from("payments").select("tenant_id").eq("id", paymentId).maybeSingle(),
  ]);
  const org = orgRow as Org | null;
  const backHref = payment?.tenant_id ? `/tenants/${payment.tenant_id}` : "/dashboard";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={backHref} className="text-sm text-slate-500 hover:underline">
          ← Back to tenant
        </Link>
        <PrintButton label="Print receipt" />
      </div>

      <Card className="print-area p-6">
        <div className="border-b border-dashed border-slate-300 pb-4 text-center">
          <Brand size="lg" />
          {org?.name ? <p className="mt-1 text-sm text-slate-500">{org.name}</p> : null}
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Payment Receipt
          </p>
        </div>

        <div className="py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">Payment received</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{formatMoney(s.amount_cents)}</p>
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100 py-2">
          <Row label="Receipt No" value={s.receipt_no} />
          <Row label="Tenant" value={s.tenant_name} />
          {s.unit ? <Row label="Room" value={s.unit} /> : null}
          <Row
            label="Date"
            value={new Date(s.paid_at).toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
          <Row label="Method" value={s.method.toUpperCase()} />
          <Row label="Balance" value={formatMoney(s.arrears_cents)} />
          {s.covered_until ? <Row label="Covered Until" value={s.covered_until} /> : null}
        </div>

        <p className="pt-4 text-center text-sm text-slate-500">Thank you.</p>
      </Card>
    </div>
  );
}
