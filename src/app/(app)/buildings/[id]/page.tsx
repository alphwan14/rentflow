import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatKES } from "@/core/money";
import { formatPeriod } from "@/core/period";
import { setUnitStatus } from "@/server/actions/buildings";
import { getBuildings, getLeases, getUnits } from "@/server/queries";
import { canManage, requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ButtonLink, Card, CardHeader, PageHeader, StatusBadge, cx } from "@/ui";
import { leaseStatus } from "../../owing-table";
import { BuildingSettings } from "./settings-form";

export const metadata: Metadata = { title: "Building" };

export default async function BuildingPage({ params }: PageProps<"/buildings/[id]">) {
  const s = await requireOrg();
  const { id } = await params;
  const db = await supabaseServer();
  const buildings = await getBuildings(db, s.org.orgId);
  const b = buildings.find((x) => x.id === id);
  if (!b) notFound();
  const [units, leases, { data: channels }] = await Promise.all([
    getUnits(db, s.org.orgId, id),
    getLeases(db, s.org.orgId, id),
    db.from("payout_channels").select("kind, number, bank_name").eq("org_id", s.org.orgId).or(`building_id.eq.${id},building_id.is.null`),
  ]);
  const byUnit = new Map(leases.map((l) => [l.unit_id, l]));
  const manage = canManage(s.org.role);
  const vacantCount = units.filter((u) => u.status !== "occupied").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={b.name}
        sub={[
          b.location,
          `${units.length} units`,
          `${vacantCount} vacant`,
          `books from ${formatPeriod(b.tracking_from)}`,
          ...(channels ?? []).map((c) => `${c.kind === "paybill" ? "Paybill" : c.kind === "till" ? "Till" : c.bank_name ?? "Bank"} ${c.number}`),
        ]
          .filter(Boolean)
          .join(" · ")}
        action={manage && vacantCount > 0 ? <ButtonLink href={`/buildings/${id}/import`}>Add tenants</ButtonLink> : null}
      />

      <Card>
        <CardHeader title="Units" sub="Tap a unit to see the tenant's statement." />
        <ul className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
          {units.map((u) => {
            const l = byUnit.get(u.id);
            return (
              <li key={u.id} className={cx("rounded-xl border p-3", l ? "border-line" : "border-dashed border-line-strong bg-page/50")}>
                {l ? (
                  <Link href={`/tenants/${l.lease_id}`} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{u.code}</span>
                      <StatusBadge status={leaseStatus(l)} />
                    </div>
                    <div className="mt-1 truncate text-[13px] text-ink-2">{l.tenant_name}</div>
                    <div className="num mt-0.5 text-[12px] text-muted">{l.balance_cents > 0 ? `owes ${formatKES(l.balance_cents)}` : "paid up"}</div>
                  </Link>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{u.code}</span>
                      <span className="text-[12px] text-muted">{u.status === "ready" ? "Ready" : "Vacant"}</span>
                    </div>
                    <div className="num mt-1 text-[12px] text-muted">{u.rent_cents ? formatKES(u.rent_cents) : "No rent set"}</div>
                    {manage && (
                      <form action={setUnitStatus.bind(null, u.id, u.status === "ready" ? "vacant" : "ready")}>
                        <button className="mt-1 text-[12px] font-medium text-accent">{u.status === "ready" ? "Mark not ready" : "Mark ready to let"}</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {manage && <BuildingSettings building={b} plan={s.org.plan} />}
    </div>
  );
}
