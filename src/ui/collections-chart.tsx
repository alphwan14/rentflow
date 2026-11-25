"use client";

import { useState } from "react";
import { formatKES, formatKESCompact } from "@/core/money";
import { formatMonthShort, formatPeriod } from "@/core/period";

export interface ChartPoint {
  period: string;
  billed: number;
  collected: number;
}

/**
 * Collected vs billed per month. Each month is one bar: the light track is
 * what was billed, the accent fill is what came in (a meter, so a single
 * hue ramp carries both). Hover / tap shows exact values; a table is
 * available to screen readers.
 */
export function CollectionsChart({ data }: { data: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.collected)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const H = 180;
  const last = data.length - 1;
  const shown = active ?? last;
  const s = data[shown];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5">
        <div className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">{formatPeriod(s.period, true)}</span>
          {": "}
          <span className="num">{formatKES(s.collected)}</span> collected of <span className="num">{formatKES(s.billed)}</span> billed
          {s.billed > 0 && <span className="num text-muted"> · {Math.round((s.collected / s.billed) * 100)}%</span>}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-ink-2" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-accent" /> Collected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-accent-track" /> Billed
          </span>
        </div>
      </div>

      <div className="relative mt-4 flex px-5 pb-5" aria-hidden onMouseLeave={() => setActive(null)}>
        <div className="relative mr-2 w-9 shrink-0" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 -translate-y-1/2 text-[11px] text-muted" style={{ top: H - (t / top) * H }}>
              {formatKESCompact(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: H }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: H - (t / top) * H }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-2">
            {data.map((d, i) => {
              const bh = (d.billed / top) * H;
              const ch = (Math.min(d.collected, Math.max(d.billed, d.collected)) / top) * H;
              return (
                <button
                  key={d.period}
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className="group relative flex h-full flex-1 items-end justify-center"
                >
                  <span className="relative block w-full max-w-9" style={{ height: Math.max(bh, ch) }}>
                    <span className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-accent-track" style={{ height: bh }} />
                    <span
                      className={`absolute inset-x-0 bottom-0 rounded-t-[4px] bg-accent transition-opacity ${active !== null && active !== i ? "opacity-50" : ""}`}
                      style={{ height: ch }}
                    />
                  </span>
                  <span className={`absolute -bottom-5 text-[11px] ${i === shown ? "font-medium text-ink" : "text-muted"}`}>{formatMonthShort(d.period)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>Rent billed and collected per month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Billed</th>
            <th>Collected</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.period}>
              <td>{formatPeriod(d.period, true)}</td>
              <td>{formatKES(d.billed)}</td>
              <td>{formatKES(d.collected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 3–5 round ticks from 0 up to ≥ max (cents). */
function niceTicks(maxCents: number): number[] {
  const max = maxCents / 100;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Math.round(v * 100));
  return out.length > 1 ? out : [0, Math.round(step * 100)];
}
