import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildStatement, chargeLabel } from "@/core/ledger";
import { formatDate, formatPeriod } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { getLeaseDetail } from "@/server/queries";
import { canManage, requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { Card, CardHeader, Money, PageHeader, Pill, StatCard, StatusBadge, cx } from "@/ui";
import { leaseStatus } from "../../owing-table";
import { ReverseButton } from "./reverse-button";

export const metadata: Metadata = { title: "Tenant" };

export default async function LeasePage({ params }: PageProps<"/tenants/[leaseId]">) {
  const s = await requireOrg();
  const { leaseId } = await params;
  const db = await supabaseServer();
  const d = await getLeaseDetail(db, leaseId);
  if (!d) notFound();
  const { lease: l, entries, payments } = d;
  const st = buildStatement(entries, { monthlyRentCents: l.rent_cents });
  const manage = canManage(s.org.role);

  // Running balance over the ledger, newest first for display.
  const lines = runningBalance(entries);
  const reversed = new Set(entries.filter((e) => e.reversesId).map((e) => e.reversesId!));

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {l.tenant_name} <StatusBadge status={leaseStatus(l)} />
          </span>
        }
        sub={[`${l.unit_code}, ${l.building_name}`, ...l.phones.map(formatPhone), `since ${formatDate(l.start_date)}`].join(" · ")}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={st.balanceCents < 0 ? "In credit" : "Owes"} value={<Money cents={Math.abs(st.balanceCents)} />} />
        <StatCard label="Monthly rent" value={<Money cents={l.rent_cents} />} hint={`due on the ${ordinal(l.due_day)}`} />
        <StatCard
          label="Covered until"
          value={st.coveredUntil ? formatPeriod(st.coveredUntil) : "Not yet"}
          hint={st.oldestUnpaidDue ? `unpaid since ${formatDate(st.oldestUnpaidDue)}` : "nothing unpaid"}
        />
        <StatCard label="Last paid" value={l.last_paid_on ? formatDate(l.last_paid_on) : "Never"} />
      </div>

      <Card>
        <CardHeader title="Statement" sub="Payments clear the oldest charge first." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-y border-line bg-page/60 text-left text-[12px] text-muted">
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 text-right font-medium">Charged</th>
                <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                <th className="px-5 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...lines].reverse().map((e) => {
                const charge = st.charges.find((c) => c.entryId === e.id);
                const struck = reversed.has(e.id);
                const label =
                  e.kind === "charge"
                    ? chargeLabel({ chargeKind: e.chargeKind ?? "other", period: e.period ?? null, description: e.description ?? null })
                    : e.kind === "payment"
                      ? `Payment ${e.description ?? ""}`
                      : e.kind === "reversal"
                        ? `Reversed: ${e.description ?? ""}`
                        : (e.description ?? "Adjustment");
                return (
                  <tr key={e.id} className={cx(struck && "text-muted line-through")}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-ink-2">{formatDate(e.effectiveDate)}</td>
                    <td className="px-3 py-2.5">
                      {label}
                      {charge && charge.outstandingCents > 0 && !struck && (
                        <span className="ml-2">
                          <Pill>{charge.paidCents > 0 ? "part paid" : "unpaid"}</Pill>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{e.amountCents > 0 ? <Money cents={e.amountCents} /> : null}</td>
                    <td className="px-3 py-2.5 text-right">{e.amountCents < 0 ? <Money cents={-e.amountCents} /> : null}</td>
                    <td className="px-5 py-2.5 text-right font-medium">
                      <Money cents={e.running} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardHeader title="Payments" />
          <ul className="divide-y divide-line border-t border-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className={cx("text-[14px] font-medium", p.status === "reversed" && "text-muted line-through")}>
                    <Money cents={p.amount_cents} /> <span className="num font-normal text-muted">· {p.reference}</span>
                  </div>
                  <div className="text-[12px] text-muted">
                    {formatDate(p.paid_at.slice(0, 10))} ·{" "}
                    {p.match_method === "auto" ? "matched automatically" : p.match_method === "confirmed" ? "confirmed by you" : "recorded by hand"}
                    {p.status === "reversed" && " · reversed"}
                  </div>
                </div>
                {manage && p.status === "posted" && <ReverseButton paymentId={p.id} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function runningBalance<T extends { amountCents: number }>(entries: T[]): (T & { running: number })[] {
  const out: (T & { running: number })[] = [];
  for (const e of entries) out.push({ ...e, running: (out.at(-1)?.running ?? 0) + e.amountCents });
  return out;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
