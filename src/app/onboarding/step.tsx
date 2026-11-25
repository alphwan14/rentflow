import type { ReactNode } from "react";

/** "Step 2 of 4" + title + one line of help. */
export function Step({ n, title, sub }: { n: number; title: string; sub: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[13px] font-medium text-muted">Step {n} of 4</p>
      <div className="mt-2 mb-4 flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= n ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
      <h1 className="text-[20px] font-semibold">{title}</h1>
      <p className="mt-1 text-[15px] text-muted">{sub}</p>
    </div>
  );
}
