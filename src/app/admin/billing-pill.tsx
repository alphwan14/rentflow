import type { Billing } from "@/server/admin";
import { cx } from "@/ui";

const PILL: Record<Billing, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-paid-soft text-paid" },
  trial: { label: "Trial", cls: "bg-ahead-soft text-ahead" },
  overdue: { label: "Overdue", cls: "bg-unpaid-soft text-unpaid" },
  cancelled: { label: "Cancelled", cls: "bg-page text-muted border border-line" },
  free: { label: "Free plan", cls: "bg-page text-muted border border-line" },
};

/** Has this landlord paid RentFlow? */
export function BillingPill({ billing }: { billing: Billing }) {
  const p = PILL[billing];
  return <span className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap", p.cls)}>{p.label}</span>;
}

export const BILLING_LABEL: Record<Billing, string> = Object.fromEntries(Object.entries(PILL).map(([k, v]) => [k, v.label])) as Record<Billing, string>;
