import type { Metadata } from "next";
import Link from "next/link";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { ORG_ID as DEMO_ORG_ID } from "@/demo/data";
import { getInbox, getPayments } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, List, ListRow, PageTitle } from "@/ui";
import { SOURCE_LABEL } from "../_parts/status";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [payments, inbox] = await Promise.all([getPayments(db, s.org.orgId), getInbox(db, s.org.orgId, null, 1)]);
  return (
    <div className="fade-in">
      <PageTitle action={<ButtonLink href="/payments/upload">Upload M-Pesa statement</ButtonLink>}>Payments</PageTitle>

      {inbox.count > 0 && (
        <Link href="/payments/who-paid" className="mb-4 flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-line bg-card px-6 py-4 hover:border-line-strong sm:mb-6">
          <span>
            <span className="block text-[15px] font-semibold">Who paid this?</span>
            <span className="text-[15px] text-muted">
              {inbox.count} {inbox.count === 1 ? "payment needs" : "payments need"} you to say who paid.
            </span>
          </span>
          <span className="text-[15px] font-medium text-accent">Check now →</span>
        </Link>
      )}

      <Card>
        {payments.length ? (
          <List>
            {payments.map((p) => {
              const who =
                p.status === "matched" && p.tenant_name ? `${p.unit_code} · ${p.tenant_name}` : p.status === "ignored" ? "Not rent" : p.status === "matched" ? "Matched" : "Who paid this?";
              const from = p.payer_phone ? formatPhone(p.payer_phone) : p.payer_phone_masked ?? p.payer_name ?? "";
              return (
                <ListRow
                  key={p.id}
                  href={p.status === "matched" && p.lease_id ? `/tenants/${p.lease_id}` : p.status === "ignored" ? undefined : "/payments/who-paid"}
                  title={who}
                  sub={[formatDate(p.occurred_at.slice(0, 10)), SOURCE_LABEL[p.source] ?? "Payment", from].filter(Boolean).join(" · ")}
                  end={
                    <>
                      <span className="money text-[15px]">{formatKES(p.amount_cents)}</span>
                      {p.status !== "matched" && p.status !== "ignored" && <span className="text-[13px] text-partial">Needs you</span>}
                    </>
                  }
                />
              );
            })}
          </List>
        ) : (
          <EmptyState
            title="No payments yet"
            body="Upload your M-Pesa statement and RentFlow will match each payment to a tenant."
            action={<ButtonLink href="/payments/upload">Upload M-Pesa statement</ButtonLink>}
          />
        )}
      </Card>
      {s.org.orgId === DEMO_ORG_ID && (
        <p className="mt-4 text-center text-[13px] text-muted">
          Trying the demo?{" "}
          <a href="/payments/sample" download className="text-accent underline-offset-4 hover:underline">
            Download a sample statement
          </a>{" "}
          to upload.
        </p>
      )}
    </div>
  );
}
