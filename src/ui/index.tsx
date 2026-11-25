import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { PayStatus } from "@/core/ledger";
import { formatKES } from "@/core/money";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** "KES 184,000" in tabular figures. */
export function Money({ cents, className, sign }: { cents: number; className?: string; sign?: boolean }) {
  return <span className={cx("num whitespace-nowrap", className)}>{formatKES(cents, { sign })}</span>;
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-[16px] bg-card border border-line/60", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-2">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="num mt-3 text-[26px] leading-none font-semibold tracking-tight text-ink sm:text-[30px]">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-muted">{hint}</div>}
    </>
  );
  const cls = "block rounded-[16px] bg-card border border-line/60 p-4 sm:p-5";
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const STATUS: Record<PayStatus, { label: string; cls: string; dot: string }> = {
  paid: { label: "Paid", cls: "bg-paid-soft text-paid", dot: "bg-paid" },
  partial: { label: "Part paid", cls: "bg-partial-soft text-partial", dot: "bg-partial" },
  unpaid: { label: "Unpaid", cls: "bg-unpaid-soft text-unpaid", dot: "bg-unpaid" },
};

/** Status chip: colour + dot + word (never colour alone). */
export function StatusBadge({ status }: { status: PayStatus }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", s.cls)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-page text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90",
  secondary: "bg-card text-ink border border-line-strong hover:bg-page",
  ghost: "text-ink-2 hover:bg-page",
  danger: "bg-card text-unpaid border border-line-strong hover:bg-unpaid-soft",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
    size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10 px-5 text-[14px]",
    BTN[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export const inputClass =
  "block w-full h-11 rounded-xl border border-line-strong bg-card px-3.5 text-[15px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-unpaid">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  const cls = tone === "error" ? "bg-unpaid-soft text-unpaid" : tone === "success" ? "bg-paid-soft text-paid" : "bg-accent-soft text-accent";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-[14px]", cls)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Tabs driven by a search param, so they work without JS and are linkable. */
export function LinkTabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-page p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={t.key === active}
          href={t.href}
          scroll={false}
          className={cx(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            t.key === active ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Count({ n, tone = "neutral" }: { n: number; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5",
        tone === "accent" ? "bg-accent text-accent-ink" : "bg-line text-ink-2",
      )}
    >
      {n}
    </span>
  );
}
