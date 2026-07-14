import { formatMoney } from "@/lib/ledger/money";
import type { LedgerEntry } from "@/lib/supabase/types";

const ENTRY_LABEL: Record<LedgerEntry["entry_type"], string> = {
  charge: "Rent charged",
  payment: "Payment received",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

type TimelineEntry = LedgerEntry & { balanceAfter: number };

/**
 * Phone-width rendering of the ledger: stacked cards instead of a 4-column
 * table. Screens only — the desktop table stays for md+ and for print.
 */
export function LedgerMobileList({ rows }: { rows: TimelineEntry[] }) {
  return (
    <ul className="divide-y divide-slate-100 md:hidden print:hidden">
      {rows.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">{ENTRY_LABEL[e.entry_type]}</p>
            <p className="text-xs text-slate-500">
              {new Date(e.occurred_at).toLocaleDateString("en-KE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={`text-sm font-semibold tabular-nums ${
                e.amount_cents < 0 ? "text-emerald-600" : "text-slate-900"
              }`}
            >
              {e.amount_cents < 0 ? "−" : "+"}
              {formatMoney(Math.abs(e.amount_cents), { withSymbol: false })}
            </p>
            <p className="text-xs tabular-nums text-slate-400">
              bal {formatMoney(e.balanceAfter, { withSymbol: false })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
