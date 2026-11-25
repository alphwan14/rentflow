import Link from "next/link";
import { formatKES } from "@/core/money";

/**
 * "Still owed": the big number is current tenants only (money you can chase
 * today). Money left by tenants who moved out sits on a smaller line below,
 * so it isn't forgotten but doesn't inflate what's actionable.
 */
export function StillOwedCard({ current, past, pastCount, currentHref }: { current: number; past: number; pastCount: number; currentHref: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-card">
      <Link href={currentHref} className="block p-4 pb-3 sm:p-6 sm:pb-3">
        <div className="text-[13px] text-muted">Still owed</div>
        <div className="mt-2 text-[20px] leading-none font-semibold">
          <span className="money">{formatKES(current)}</span>
        </div>
        <div className="mt-2 text-[13px] text-muted">by current tenants</div>
      </Link>
      {past > 0 && (
        <Link
          href="/tenants?show=moved-out"
          className="flex min-h-11 items-center justify-between gap-2 border-t border-line px-4 text-[13px] text-muted hover:text-ink sm:px-6"
        >
          <span>
            Past tenants ({pastCount}): <span className="money text-ink">{formatKES(past)}</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}
    </div>
  );
}
