"use client";

import { useState, useTransition } from "react";
import { adminSetPlan } from "@/server/actions/admin";

export function PlanPicker({ orgId, plan, name }: { orgId: string; plan: "free" | "growth" | "pro"; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <label htmlFor={`plan-${orgId}`} className="sr-only">
        Plan for {name}
      </label>
      <select
        id={`plan-${orgId}`}
        defaultValue={plan}
        disabled={pending}
        className="h-11 rounded-xl border border-line-strong bg-card px-3 text-[15px]"
        onChange={(e) =>
          start(async () => {
            const r = await adminSetPlan(orgId, e.target.value as "free" | "growth" | "pro");
            setError(r.ok ? null : r.error);
          })
        }
      >
        <option value="free">Free</option>
        <option value="growth">Growth</option>
        <option value="pro">Pro</option>
      </select>
      {error && <span className="text-[13px] text-unpaid">{error}</span>}
    </span>
  );
}
