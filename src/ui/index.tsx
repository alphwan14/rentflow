/**
 * RentFlow components. Every screen is built from these so the app stays
 * consistent: Button, Card, StatusPill, MoneyText, StatCard, ListRow, Tabs,
 * EmptyState (+ BottomNav / TopNav in ./nav).
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { PAY_STATUS_LABEL, type PayStatus } from "@/core/ledger";
import { formatKES } from "@/core/money";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ── Money ────────────────────────────────────────────────────────────────
/** "KES 184,000". Tabular figures, semibold. */
export function MoneyText({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("money", className)}>{formatKES(Math.abs(cents))}</span>;
}

// ── Status ───────────────────────────────────────────────────────────────
const PILL: Record<PayStatus, string> = {
  paid: "bg-paid-soft text-paid",
  partial: "bg-partial-soft text-partial",
  unpaid: "bg-unpaid-soft text-unpaid",
  ahead: "bg-ahead-soft text-ahead",
};

export function StatusPill({ status, className }: { status: PayStatus; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap", PILL[status], className)}>
      {PAY_STATUS_LABEL[status]}
    </span>
  );
}

/** "Owes KES 12,000" / "Paid ahead KES 3,000" / "Paid". */
export function OwesText({ balanceCents, className }: { balanceCents: number; className?: string }) {
  if (balanceCents > 0)
    return (
      <span className={className}>
        Owes <MoneyText cents={balanceCents} />
      </span>
    );
  if (balanceCents < 0)
    return (
      <span className={className}>
        Paid ahead <MoneyText cents={balanceCents} />
      </span>
    );
  return <span className={className}>Paid</span>;
}

// ── Surfaces ─────────────────────────────────────────────────────────────
export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-card", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{children}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageTitle({ children, sub, action, back }: { children: ReactNode; sub?: ReactNode; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex min-h-11 items-center text-[13px] text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-semibold">{children}</h1>
          {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-2 text-[20px] leading-none font-semibold">{value}</div>
      {sub && <div className="mt-2 text-[13px] text-muted">{sub}</div>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-6";
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Lists ────────────────────────────────────────────────────────────────
/**
 * One row of a list. Left: a short code (unit). Middle: title + sub.
 * Right: amount / pill / action. Whole row can be a link.
 */
export function ListRow({
  lead,
  title,
  sub,
  end,
  action,
  href,
}: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  action?: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      {lead !== undefined && <div className="w-11 shrink-0 text-[15px] font-semibold">{lead}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {sub && <div className="truncate text-[13px] text-muted">{sub}</div>}
      </div>
      {end && <div className="flex shrink-0 flex-col items-end gap-1 text-right">{end}</div>}
    </>
  );
  return (
    <li className="flex items-center gap-3 px-4 sm:px-6">
      {href ? (
        <Link href={href} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3">
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3">{inner}</div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx("divide-y divide-line", className)}>{children}</ul>;
}

// ── Buttons ──────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-line-strong bg-card text-ink hover:bg-page",
  ghost: "text-ink hover:bg-page",
  danger: "border border-line-strong bg-card text-unpaid hover:bg-unpaid-soft",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "lg" | "sm" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
    size === "lg" ? "h-12 px-6 text-[15px]" : size === "sm" ? "h-11 px-3.5 text-[13px]" : "h-11 px-5 text-[15px]",
    BTN[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

// ── Forms ────────────────────────────────────────────────────────────────
export const inputClass =
  "block h-12 w-full rounded-xl border border-line-strong bg-card px-4 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-unpaid">{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const cls = tone === "error" ? "bg-unpaid-soft text-unpaid" : tone === "success" ? "bg-paid-soft text-paid" : "bg-page text-ink";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("fade-in rounded-xl px-4 py-3 text-[15px]", cls)}>
      {children}
    </div>
  );
}

// ── Empty states & tabs ──────────────────────────────────────────────────
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[15px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-page p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          href={t.href}
          scroll={false}
          className={cx(
            "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[14px] font-medium whitespace-nowrap transition-colors duration-150 sm:gap-2 sm:px-4 sm:text-[15px]",
            t.key === active ? "bg-card text-ink shadow-[0_1px_2px_rgba(15,17,21,0.06)]" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold text-white">{n}</span>;
}

/** Filter pills (All, Not paid, …). */
export function FilterPills({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          scroll={false}
          aria-current={it.key === active ? "true" : undefined}
          className={cx(
            "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] whitespace-nowrap transition-colors duration-150",
            it.key === active ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:border-line-strong",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cx("tnum text-[13px]", it.key === active ? "text-white/70" : "text-muted")}>{it.count}</span>}
        </Link>
      ))}
    </div>
  );
}
