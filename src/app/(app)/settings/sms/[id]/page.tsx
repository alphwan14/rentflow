import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { SmsBadge, formatDuration } from "@/components/sms-badge";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/ledger/money";
import { classifySmsFailure, confirmationOverdue } from "@/lib/sms/status";
import type { SmsMessage, ReceiptSnapshot } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type Stage = {
  label: string;
  at: string | null;
  detail?: string;
  state: "done" | "active" | "pending" | "failed";
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function SmsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase.from("sms_messages").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const m = row as SmsMessage;

  const [{ data: tenant }, { data: receipt }] = await Promise.all([
    supabase.from("tenants").select("full_name,is_deleted").eq("id", m.tenant_id).maybeSingle(),
    m.payment_id
      ? supabase.from("receipts").select("receipt_no,snapshot").eq("payment_id", m.payment_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const snapshot = receipt?.snapshot as ReceiptSnapshot | undefined;

  const failure = m.status === "failed" ? classifySmsFailure(m.error) : null;
  const overdue = m.status === "sent" && confirmationOverdue(m.sent_at, new Date());

  // Build the business timeline from the durable timestamps. Payment, receipt
  // and enqueue commit in ONE transaction, so they share created_at.
  const stages: Stage[] = [
    { label: "Payment recorded", at: m.created_at, state: "done" },
    { label: "Receipt generated", at: m.created_at, detail: receipt?.receipt_no, state: "done" },
    {
      label: "SMS queued",
      at: m.created_at,
      state: m.status === "pending" ? "active" : "done",
    },
  ];
  if (m.locked_at && !m.sent_at) {
    stages.push({ label: "Picked up for sending", at: m.locked_at, state: "active" });
  }
  if (m.status === "sending" || m.status === "retrying") {
    stages.push({
      label: "Sending SMS",
      at: m.next_attempt_at && m.status === "retrying" ? m.next_attempt_at : null,
      detail:
        m.status === "retrying"
          ? `Retrying automatically (attempt ${m.attempts + 1} of ${m.max_attempts})`
          : undefined,
      state: "active",
    });
  }
  if (m.sent_at) {
    stages.push({
      label: "SMS sent",
      at: m.sent_at,
      detail: `Left RentFlow ${formatDuration((new Date(m.sent_at).getTime() - new Date(m.created_at).getTime()) / 1000)} after the payment`,
      state: "done",
    });
    if (m.status === "delivered" && m.delivered_at) {
      stages.push({
        label: "Delivered",
        at: m.delivered_at,
        detail: `Confirmed ${formatDuration((new Date(m.delivered_at).getTime() - new Date(m.sent_at).getTime()) / 1000)} after sending`,
        state: "done",
      });
    } else if (m.status === "sent") {
      stages.push({
        label: "Awaiting delivery confirmation",
        at: null,
        detail: overdue
          ? "Confirmation is overdue — the phone may be off, or the network hasn't reported back yet."
          : "The message has been sent. Waiting for confirmation from the mobile network.",
        state: "active",
      });
    }
  }
  if (m.status === "failed") {
    stages.push({
      label: "Delivery failed",
      at: null,
      detail: failure?.reason,
      state: "failed",
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/settings/sms" className="text-sm text-slate-500 hover:underline">
          ← SMS Diagnostics
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            {tenant?.full_name ?? m.to_phone}
          </h1>
          <SmsBadge status={m.status} />
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {m.to_phone}
          {receipt ? ` · ${receipt.receipt_no}` : ""}
          {snapshot ? ` · ${formatMoney(snapshot.amount_cents)}` : ""}
        </p>
      </div>

      {/* ---- failure summary ---- */}
      {failure ? (
        <Card className="border-red-100 bg-red-50/60 p-4">
          <p className="text-sm font-semibold text-red-700">{failure.reason}</p>
          <p className="mt-1 text-sm text-red-600/90">{failure.suggestion}</p>
          <p className="mt-2 text-xs text-red-400">
            {m.attempts} of {m.max_attempts} attempts used
          </p>
        </Card>
      ) : null}

      {/* ---- timeline ---- */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Timeline
        </h2>
        <ol className="relative space-y-5 border-l border-slate-200 pl-5">
          {stages.map((s, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                  s.state === "done"
                    ? "bg-emerald-500"
                    : s.state === "active"
                      ? "animate-pulse bg-amber-400"
                      : s.state === "failed"
                        ? "bg-red-500"
                        : "bg-slate-300"
                }`}
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-900">{s.label}</p>
              {s.at ? <p className="text-xs tabular-nums text-slate-400">{fmt(s.at)}</p> : null}
              {s.detail ? <p className="mt-0.5 text-xs text-slate-500">{s.detail}</p> : null}
            </li>
          ))}
        </ol>
      </Card>

      {/* ---- message body ---- */}
      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Message
        </h2>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
          {m.body}
        </pre>
      </Card>

      {tenant && !tenant.is_deleted ? (
        <p className="text-center text-sm">
          <Link href={`/tenants/${m.tenant_id}`} className="font-medium text-brand hover:underline">
            Open tenant profile →
          </Link>
        </p>
      ) : tenant ? (
        <p className="text-center text-sm text-slate-400">
          This tenant has been deleted — SMS history is kept for your records.
        </p>
      ) : null}
    </div>
  );
}
