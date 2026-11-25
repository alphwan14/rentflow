"use client";

import { useState } from "react";
import { formatKES, formatKESCompact } from "@/core/money";
import { formatMonthShort } from "@/core/period";
import { monthName } from "@/core/messages";

export interface ChartPoint {
  period: string;
  collected: number;
}

/**
 * "Rent collected" — one bar per month. Grey bars, the current month in
 * black. Tap or hover a bar to see the amount; a table is there for screen readers.
 */
export function RentChart({ data }: { data: ChartPoint[] }) {
  const last = data.length - 1;
  const [active, setActive] = useState<number>(last);
  const max = Math.max(1, ...data.map((d) => d.collected));
  const H = 140;
  const a = data[active];
  return (
    <div className="px-6 pb-6">
      <div className="mb-4 text-[15px]">
        <span className="money">{formatKES(a.collected)}</span>
        <span className="text-muted"> collected in {monthName(a.period)}</span>
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: H + 24 }} aria-hidden>
        {data.map((d, i) => {
          const h = Math.max(d.collected > 0 ? 4 : 2, Math.round((d.collected / max) * H));
          const on = i === active;
          return (
            <button
              key={d.period}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="w-full max-w-12 rounded-t transition-colors duration-150" style={{ height: h, background: i === last ? "var(--ink)" : on ? "#9aa0aa" : "var(--chart)" }} />
              <span className={`text-[13px] ${on ? "text-ink" : "text-muted"}`}>{formatMonthShort(d.period)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[13px] text-muted" aria-hidden>
        <span>KES 0</span>
        <span className="tnum">Highest KES {formatKESCompact(max)}</span>
      </div>
      <table className="sr-only">
        <caption>Rent collected each month</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.period}>
              <th scope="row">{monthName(d.period)}</th>
              <td>{formatKES(d.collected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
