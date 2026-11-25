import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatKES } from "@/core/money";
import { formatDate, todayNairobi } from "@/core/period";
import { PLAN_LABEL } from "@/core/plans";
import { getBilling, requireStaff, type SubscriptionPayment } from "@/server/admin";
import { Card, CardTitle, List, ListRow, PageTitle } from "@/ui";
import { BillingPill } from "../../billing-pill";
import { PlanPicker } from "../../plans/plan-picker";
import { RecordPaymentForm, SubscriptionForm } from "./forms";

export const metadata: Metadata = { title: "Billing" };

const METHOD: Record<string, string> = { mpesa: "M-Pesa", bank: "Bank", cash: "Cash", other: "Other" };

export default async function LandlordBilling({ params }: PageProps<"/admin/billing/[orgId]">) {
  const { db } = await requireStaff();
  const { orgId } = await params;
  const r = (await getBilling(db)).find((x) => x.org_id === orgId);
  if (!r) notFound();
  const { data } = await db.rpc("admin_subscription_payments", { p_org: orgId });
  const payments = ((data ?? []) as SubscriptionPayment[]).map((p) => ({ ...p, amount_cents: Number(p.amount_cents) }));

  const line =
    r.billing === "paid" && r.paid_until
      ? `Paid up to ${formatDate(r.paid_until)}`
      : r.billing === "trial" && r.trial_ends
        ? `Free trial until ${formatDate(r.trial_ends)}`
        : r.billing === "overdue"
          ? r.paid_until
            ? `Was paid up to ${formatDate(r.paid_until)}`
            : "Trial over, nothing paid yet"
          : r.billing === "free"
            ? "On the Free plan, nothing to pay"
            : "Cancelled";

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle back={{ href: "/admin/plans", label: "Plans & billing" }} sub={[r.owner_name, r.owner_email].filter(Boolean).join(" · ")}>
        {r.name}
      </PageTitle>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[20px] font-semibold">{line}</p>
          <BillingPill billing={r.billing} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-[15px] sm:grid-cols-4">
          <div>
            <dt className="text-[13px] text-muted">Plan</dt>
            <dd className="mt-1">
              <PlanPicker orgId={r.org_id} plan={r.plan} name={r.name} align="start" />
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Units</dt>
            <dd className="tnum mt-1 font-semibold">{r.units}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Monthly</dt>
            <dd className="money mt-1">{r.plan === "free" ? "—" : formatKES(r.monthly_cents)}</dd>
            {r.plan !== "free" && <dd className="text-[13px] text-muted">{formatKES(r.price_per_unit_cents)} per unit</dd>}
          </div>
          <div>
            <dt className="text-[13px] text-muted">Paid in total</dt>
            <dd className="money mt-1">{formatKES(r.total_paid_cents)}</dd>
          </div>
        </dl>
      </Card>

      {r.plan !== "free" && (
        <Card className="mt-4 p-6 sm:mt-6">
          <h2 className="mb-4 text-[15px] font-semibold">Record a payment</h2>
          <RecordPaymentForm orgId={r.org_id} monthlyCents={r.monthly_cents} today={todayNairobi()} />
        </Card>
      )}

      <Card className="mt-4 sm:mt-6">
        <CardTitle>Payments to RentFlow</CardTitle>
        {payments.length ? (
          <List className="border-t border-line">
            {payments.map((p) => (
              <ListRow
                key={p.id}
                title={`${formatKES(p.amount_cents)} for ${p.months} ${p.months === 1 ? "month" : "months"}`}
                sub={[formatDate(p.paid_on), METHOD[p.method] ?? p.method, p.reference, `paid up to ${formatDate(p.paid_until_after)}`].filter(Boolean).join(" · ")}
              />
            ))}
          </List>
        ) : (
          <p className="px-6 pb-6 text-[15px] text-muted">No payments recorded yet.</p>
        )}
      </Card>

      <Card className="mt-4 p-6 sm:mt-6">
        <h2 className="mb-4 text-[15px] font-semibold">Subscription</h2>
        <SubscriptionForm
          orgId={r.org_id}
          status={r.billing === "cancelled" ? "cancelled" : r.paid_until ? "active" : "trial"}
          trialEnds={r.trial_ends}
          priceOverride={r.price_override_cents}
          notes={r.notes}
        />
      </Card>
      <p className="mt-4 text-[13px] text-muted">Plan: {PLAN_LABEL[r.plan]}. Every building this landlord has uses this plan.</p>
    </div>
  );
}
