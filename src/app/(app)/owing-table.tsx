import Link from "next/link";
import type { PayStatus } from "@/core/ledger";
import { formatDate } from "@/core/period";
import type { LeaseOverview } from "@/server/types";
import { Money, StatusBadge } from "@/ui";
import { IconChevronRight } from "@/ui/icons";

export function leaseStatus(l: Pick<LeaseOverview, "balance_cents" | "paid_this_month_cents">): PayStatus {
  if (l.balance_cents <= 0) return "paid";
  return l.paid_this_month_cents > 0 ? "partial" : "unpaid";
}

/** "Who hasn't paid": a table on desktop, a stacked list on phones. */
export function OwingTable({ leases, showBuilding }: { leases: LeaseOverview[]; showBuilding: boolean }) {
  return (
    <>
      <table className="hidden w-full text-[14px] md:table">
        <thead>
          <tr className="border-y border-line bg-page/60 text-left text-[12px] text-muted">
            <th className="px-5 py-2.5 font-medium">Unit</th>
            <th className="px-3 py-2.5 font-medium">Tenant</th>
            <th className="px-3 py-2.5 text-right font-medium">Owes</th>
            <th className="px-3 py-2.5 font-medium">Unpaid since</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Last paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {leases.map((l) => (
            <tr key={l.lease_id} className="hover:bg-page/50">
              <td className="px-5 py-3 font-medium">
                <Link href={`/tenants/${l.lease_id}`} className="hover:text-accent">
                  {l.unit_code}
                </Link>
                {showBuilding && <div className="text-[12px] font-normal text-muted">{l.building_name}</div>}
              </td>
              <td className="px-3 py-3">
                <Link href={`/tenants/${l.lease_id}`} className="hover:text-accent">
                  {l.tenant_name}
                </Link>
              </td>
              <td className="px-3 py-3 text-right font-semibold">
                <Money cents={l.balance_cents} />
              </td>
              <td className="px-3 py-3 text-ink-2">{formatDate(l.oldest_unpaid_due)}</td>
              <td className="px-3 py-3">
                <StatusBadge status={leaseStatus(l)} />
              </td>
              <td className="px-5 py-3 text-ink-2">{l.last_paid_on ? formatDate(l.last_paid_on) : <span className="text-muted">Never</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line border-t border-line md:hidden">
        {leases.map((l) => (
          <li key={l.lease_id}>
            <Link href={`/tenants/${l.lease_id}`} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{l.unit_code}</span>
                  <span className="truncate text-ink-2">{l.tenant_name}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                  <StatusBadge status={leaseStatus(l)} />
                  {l.oldest_unpaid_due && <span>since {formatDate(l.oldest_unpaid_due)}</span>}
                </div>
              </div>
              <Money cents={l.balance_cents} className="font-semibold" />
              <IconChevronRight size={16} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
