import { cx } from "@/ui";

const STEPS = ["Account", "Building", "Tenants", "Statement", "Arrears"];

/** Progress through the one-visit setup. */
export function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-[12px]" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
          <span className={cx("h-1 rounded-full", i <= current ? "bg-accent" : "bg-line-strong")} />
          <span className={cx("hidden sm:block", i === current ? "font-medium text-ink" : "text-muted")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}
