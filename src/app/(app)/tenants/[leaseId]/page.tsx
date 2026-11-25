import { MessageSquare, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildStatement, chargeLabel } from "@/core/ledger";
import { monthName } from "@/core/messages";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { getLeaseDetail } from "@/server/queries";
import { canManage, requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Card, CardTitle, PageTitle, StatusPill, cx } from "@/ui";
import { leaseStatus } from "../../_parts/status";
import { TenantActions, UndoPaymentButton } from "./actions";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantPage({ params }: PageProps<"/tenants/[leaseId]">) {
  const s = await requireOrg();
  const { leaseId } = await params;
  const db = await supabaseServer();
  const d = await getLeaseDetail(db, leaseId);
  if (!d) notFound();
  const { lease: l, entries, payments } = d;
  const st = buildStatement(entries, { monthlyRentCents: l.rent_cents });
  const status = leaseStatus(l);
  const phone = l.phones[0] ?? null;
  const byPayment = new Map(payments.map((p) => [p.id, p]));
  const undone = new Set(entries.filter((e) => e.reversesId).map((e) => e.reversesId!));

  const history = entries
    .filter((e) => e.kind !== "reversal")
    .map((e) => {
      const p = e.paymentId ? byPayment.get(e.paymentId) : undefined;
      let what: string;
      if (e.kind === "charge") what = chargeLabel({ chargeKind: e.chargeKind ?? "other", period: e.period ?? null, description: e.description ?? null });
      else if (e.kind === "payment") {
        const from = p?.payer_phone ? formatPhone(p.payer_phone) : p?.payer_phone_masked ?? (p?.payer_name ? titleCase(p.payer_name) : null);
        what = p?.method === "cash" ? "Cash payment" : from ? `Payment from ${from}` : "Payment";
      } else what = e.amountCents < 0 ? "Correction (paid before RentFlow)" : "Correction";
      return { id: e.id, date: e.effectiveDate, what, cents: e.amountCents, undone: undone.has(e.id), paymentId: e.paymentId, ref: p?.reference };
    })
    .reverse();

  const headline =
    st.balanceCents > 0 ? (
      <>
        Owes <span className="money">{formatKES(st.balanceCents)}</span>
      </>
    ) : st.balanceCents < 0 ? (
      <>
        Paid ahead <span className="money">{formatKES(-st.balanceCents)}</span>
      </>
    ) : (
      <>Paid up</>
    );

  return (
    <div className="fade-in mx-auto max-w-3xl">
      <PageTitle back={{ href: "/tenants", label: "Tenants" }} sub={`${l.unit_code}, ${l.building_name}${l.status === "ended" ? " · moved out" : ""}`}>
        {l.tenant_name}
      </PageTitle>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[28px] leading-tight font-semibold sm:text-[32px]">{headline}</p>
          <StatusPill status={status} />
        </div>
        <p className="mt-2 text-[15px] text-muted">
          {st.coveredUntil ? `Paid up to ${monthName(st.coveredUntil)}` : "Hasn't paid a full month yet"}
          {st.oldestUnpaidDue && ` · unpaid since ${formatDate(st.oldestUnpaidDue)}`}
          {` · rent ${formatKES(l.rent_cents)} a month`}
        </p>
        {phone && (
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`tel:+${phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-[15px] hover:bg-page">
              <Phone size={18} strokeWidth={1.5} aria-hidden /> Call {formatPhone(phone)}
            </a>
            <a href={`sms:+${phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-[15px] hover:bg-page">
              <MessageSquare size={18} strokeWidth={1.5} aria-hidden /> SMS
            </a>
          </div>
        )}
        {(l.status === "active" || st.balanceCents > 0) && (
          <div className="mt-6 border-t border-line pt-6">
            {l.status === "ended" && (
              <p className="mb-4 text-[15px] text-muted">
                Moved out{l.end_date ? ` on ${formatDate(l.end_date)}` : ""}. If they pay what they still owe, record it here.
              </p>
            )}
            <TenantActions
              leaseId={l.lease_id}
              owes={st.balanceCents > 0}
              movedOut={l.status === "ended"}
              canMoveOut={canManage(s.org.role)}
              tenantName={l.tenant_name}
              startDate={l.start_date}
            />
          </div>
        )}
      </Card>

      <Card className="mt-4 sm:mt-6">
        <CardTitle>Payment history</CardTitle>
        <ol className="divide-y divide-line">
          {history.map((h) => (
            <li key={h.id} className={cx("flex items-start gap-4 px-6 py-4", h.undone && "text-muted")}>
              <div className="min-w-0 flex-1">
                <div className={cx("text-[15px]", h.undone && "line-through")}>{h.what}</div>
                <div className="text-[13px] text-muted">
                  {formatDate(h.date)}
                  {h.undone && " · undone"}
                </div>
                {!h.undone && h.paymentId && canManage(s.org.role) && <UndoPaymentButton paymentId={h.paymentId} />}
              </div>
              <div className={cx("money shrink-0 pt-0.5 text-[15px]", h.cents < 0 && !h.undone && "text-paid")}>
                {h.cents < 0 ? "+ " : ""}
                {formatKES(Math.abs(h.cents))}
              </div>
            </li>
          ))}
        </ol>
        <p className="px-6 py-4 text-[13px] text-muted">Bills are in black, payments in green. Each payment pays the oldest bill first.</p>
      </Card>
    </div>
  );
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
