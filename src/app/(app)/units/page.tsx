import type { Metadata } from "next";
import Link from "next/link";
import { PAY_STATUS_LABEL, type PayStatus } from "@/core/ledger";
import { firstName } from "@/core/messages";
import { getBuildings, getLeases, getUnits } from "@/server/queries";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, EmptyState, PageTitle, cx } from "@/ui";
import { leaseStatus } from "../_parts/status";

export const metadata: Metadata = { title: "Units" };

const TILE: Record<PayStatus | "empty", string> = {
  paid: "bg-paid-soft text-paid border-transparent",
  ahead: "bg-ahead-soft text-ahead border-transparent",
  partial: "bg-partial-soft text-partial border-transparent",
  unpaid: "bg-unpaid-soft text-unpaid border-transparent",
  empty: "bg-card text-muted border-dashed border-line-strong",
};

export default async function UnitsPage() {
  const s = await requireOrg();
  const db = await supabaseServer();
  const [buildings, units, leases] = await Promise.all([getBuildings(db, s.org.orgId), getUnits(db, s.org.orgId), getLeases(db, s.org.orgId)]);
  const byUnit = new Map(leases.map((l) => [l.unit_id, l]));

  if (!buildings.length)
    return (
      <Card>
        <EmptyState title="No buildings yet" body="Add your building to see all its units here." action={<ButtonLink href="/onboarding">Add your building</ButtonLink>} />
      </Card>
    );

  return (
    <div className="fade-in">
      <PageTitle sub="Tap a unit to see the tenant.">Units</PageTitle>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]" aria-label="What the colours mean">
        {(["paid", "partial", "unpaid", "ahead"] as PayStatus[]).map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span className={cx("size-3 rounded", TILE[k].split(" ")[0])} aria-hidden />
            {PAY_STATUS_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span className="size-3 rounded border border-dashed border-line-strong bg-card" aria-hidden />
          Empty
        </span>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {buildings.map((b) => {
          const us = units.filter((u) => u.building_id === b.id);
          const filled = us.filter((u) => byUnit.has(u.id)).length;
          return (
            <Card key={b.id} className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{b.name}</h2>
                  <p className="text-[13px] text-muted">
                    {filled} of {us.length} units filled{b.location ? ` · ${b.location}` : ""}
                  </p>
                </div>
                <ButtonLink href={`/units/add-tenants?b=${b.id}`} variant="secondary" size="sm">
                  Add tenants
                </ButtonLink>
              </div>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
                {us.map((u) => {
                  const l = byUnit.get(u.id);
                  const st = l ? leaseStatus(l) : "empty";
                  return (
                    <li key={u.id}>
                      <Link
                        href={l ? `/tenants/${l.lease_id}` : `/units/add-tenants?b=${b.id}&unit=${encodeURIComponent(u.code)}`}
                        aria-label={l ? `${u.code}, ${l.tenant_name}, ${PAY_STATUS_LABEL[st as PayStatus]}` : `${u.code}, empty. Add tenant`}
                        className={cx("flex aspect-square min-h-16 flex-col justify-between rounded-xl border p-2 transition-opacity duration-150 hover:opacity-80", TILE[st])}
                      >
                        <span className="text-[15px] font-semibold">{u.code}</span>
                        <span className="truncate text-[12px] leading-tight">{l ? firstName(l.tenant_name) : u.status === "ready" ? "Ready" : "Empty"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
