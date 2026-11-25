"use client";

import { useState, useTransition } from "react";
import { adminSetPlanPrice } from "@/server/actions/admin";
import { Button, inputClass } from "@/ui";

export function PriceEditor({ plan, cents }: { plan: "growth" | "pro"; cents: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = `price-${plan}`;
  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("price"));
        start(async () => {
          const r = await adminSetPlanPrice(plan, v);
          setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
        });
      }}
    >
      <label htmlFor={id} className="block text-[13px] font-medium">
        {plan === "growth" ? "Growth" : "Pro"} (KES per unit)
      </label>
      <div className="flex gap-2">
        <input id={id} name="price" inputMode="decimal" defaultValue={cents ? String(cents / 100) : ""} placeholder="0" className={inputClass} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {msg && <p className={`text-[13px] ${msg.ok ? "text-paid" : "text-unpaid"}`}>{msg.text}</p>}
    </form>
  );
}
