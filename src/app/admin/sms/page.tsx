import type { Metadata } from "next";
import { monthName } from "@/core/messages";
import { requireStaff, type AdminSms } from "@/server/admin";
import { Card, EmptyState, List, ListRow, PageTitle, StatCard } from "@/ui";

export const metadata: Metadata = { title: "SMS usage" };

const KIND: Record<string, string> = { receipt: "Receipts", reminder: "Reminders", notice: "Notices", other: "Other" };

export default async function AdminSmsUsage() {
  const { db } = await requireStaff();
  const { data } = await db.rpc("admin_sms_usage");
  const rows = (data ?? []) as AdminSms[];
  const sum = (k: keyof Pick<AdminSms, "queued" | "sent" | "delivered" | "failed">) => rows.reduce((t, r) => t + r[k], 0);
  return (
    <>
      <PageTitle sub="Last 6 months. SMS sending starts in phase 4, so for now messages wait in the queue.">SMS usage</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <StatCard label="Waiting to send" value={<span className="tnum">{sum("queued")}</span>} />
        <StatCard label="Sent" value={<span className="tnum">{sum("sent")}</span>} />
        <StatCard label="Delivered" value={<span className="tnum">{sum("delivered")}</span>} />
        <StatCard label="Failed" value={<span className="tnum">{sum("failed")}</span>} />
      </div>
      <Card>
        {rows.length ? (
          <List>
            {rows.map((r) => (
              <ListRow
                key={`${r.org_id}-${r.month}-${r.kind}`}
                title={r.org_name}
                sub={`${KIND[r.kind] ?? r.kind} · ${monthName(r.month)} ${r.month.slice(0, 4)}`}
                end={
                  <span className="tnum text-[13px]">
                    {r.queued + r.sent + r.delivered + r.failed} total · {r.delivered} delivered{r.failed ? ` · ${r.failed} failed` : ""}
                  </span>
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState title="No SMS yet" body="Receipts and reminders will show here once landlords start sending them." />
        )}
      </Card>
    </>
  );
}
