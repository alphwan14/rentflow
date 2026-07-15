import { TONE_CLASSES } from "@/lib/ledger/present";
import { presentSmsStatus } from "@/lib/sms/status";
import type { SmsStatus } from "@/lib/supabase/types";

/** Compact business-state badge for an SMS row. */
export function SmsBadge({ status }: { status: SmsStatus }) {
  const view = presentSmsStatus(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[view.tone]}`}
    >
      {view.label}
    </span>
  );
}

/** "2s", "1m 04s", "1h 12m" — human duration from seconds. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
