import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { getLeases, getUpload } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, CardHeader, EmptyState, StatCard } from "@/ui";
import { IconCheck } from "@/ui/icons";
import { InboxList } from "../../inbox/inbox-list";
import { OwingTable } from "../../owing-table";

export const metadata: Metadata = { title: "Statement" };

/** Result of an upload. During onboarding this is the "aha" screen. */
export default async function StatementResult({ params, searchParams }: PageProps<"/statements/[id]">) {
  const s = await requireOrg();
  const { id } = await params;
  const { onboarding } = await searchParams;
  const db = await supabaseServer();
  const res = await getUpload(db, id);
  if (!res) notFound();
  const { upload, events } = res;
  const leases = await getLeases(db, s.org.orgId, upload.building_id);
  const owing = leases.filter((l) => l.balance_cents > 0).sort((a, b) => b.balance_cents - a.balance_cents);
  const owed = owing.reduce((t, l) => t + l.balance_cents, 0);
  const open = events.filter((e) => e.status === "suggested" || e.status === "unmatched" || e.status === "pending");
  const matched = events.filter((e) => e.status === "matched").length;
  const leaseOptions = leases.map((l) => ({ leaseId: l.lease_id, label: `${l.unit_code} · ${l.tenant_name}`, buildingId: l.building_id }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-muted">
          {upload.filename}
          {upload.period_start && ` · ${formatDate(upload.period_start)} – ${formatDate(upload.period_end)}`}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight sm:text-[34px]">
          {owed > 0 ? (
            <>
              You&apos;re owed <span className="num">{formatKES(owed)}</span>
              <span className="block text-ink-2">and here&apos;s who owes it.</span>
            </>
          ) : (
            "Everyone is paid up."
          )}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Payments read" value={<span className="num">{upload.total_payments}</span>} hint={`${upload.skipped_lines} other lines skipped`} />
        <StatCard label="Matched automatically" value={<span className="num">{matched}</span>} hint="posted and learned" icon={<IconCheck />} />
        <StatCard label="Need you" value={<span className="num">{open.length}</span>} hint="one tap each" />
        <StatCard label="Already seen" value={<span className="num">{upload.duplicate_events}</span>} hint="never counted twice" />
      </div>

      {open.length > 0 && (
        <Card>
          <CardHeader title="Payments we couldn't match for sure" sub="Confirm who paid and RentFlow remembers the payer next time." />
          <InboxList events={open} leases={leaseOptions} />
        </Card>
      )}

      <Card>
        <CardHeader title="Who owes" sub={`${owing.length} of ${leases.length} tenants`} />
        {owing.length ? <OwingTable leases={owing} showBuilding={!upload.building_id} /> : <EmptyState title="Nobody owes anything" />}
      </Card>

      {onboarding && (
        <div className="flex justify-end">
          <ButtonLink href="/home">Go to home</ButtonLink>
        </div>
      )}
    </div>
  );
}
