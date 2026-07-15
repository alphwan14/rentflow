import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { PaymentProgressCard } from "@/components/payment-progress-card";
import type { Org, Receipt, SmsMessage } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Server-side freshness check: was this row created within the last N ms? */
function createdWithin(createdAt: string, windowMs: number): boolean {
  return Date.now() - new Date(createdAt).getTime() < windowMs;
}

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

  const [{ data: orgRow }, { data: payment }, { data: smsRow }] = await Promise.all([
    supabase.from("orgs").select("*").maybeSingle(),
    supabase.from("payments").select("tenant_id").eq("id", paymentId).maybeSingle(),
    supabase.from("sms_messages").select("*").eq("payment_id", paymentId).maybeSingle(),
  ]);
  const org = orgRow as Org | null;

  // "Back to tenant" must never 404: soft-deleted tenants keep their receipts
  // but their profile page is intentionally gone — fall back to the dashboard.
  let backHref = "/dashboard";
  if (payment?.tenant_id) {
    const { data: t } = await supabase
      .from("tenants")
      .select("is_deleted")
      .eq("id", payment.tenant_id)
      .maybeSingle();
    if (t && !t.is_deleted) backHref = `/tenants/${payment.tenant_id}`;
  }

  // The floating progress card is only for a just-recorded payment: pass the
  // SMS row through only while it's fresh, so old receipts never pop the card.
  const sms = (smsRow as SmsMessage | null) ?? null;
  const freshSms = sms && createdWithin(sms.created_at, 5 * 60 * 1000) ? sms : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={backHref} className="text-sm text-slate-500 hover:underline">
          {backHref === "/dashboard" ? "← Back to dashboard" : "← Back to tenant"}
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

      {/* Floating post-payment progress (fresh payments only; fades on success). */}
      <PaymentProgressCard paymentId={paymentId} initial={freshSms} />
    </div>
  );
}
