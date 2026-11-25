"use client";

import { useState, useTransition } from "react";
import { sendReminder } from "@/server/actions/tenancy";
import { Button } from "@/ui";

/** "Remind": queues an SMS reminder. Shows the result in place. */
export function RemindButton({ leaseId, size = "sm", variant = "secondary", label = "Remind", block = false }: { leaseId: string; size?: "sm" | "md"; variant?: "secondary" | "primary"; label?: string; block?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (msg?.ok) return <span className="fade-in text-[13px] text-paid">Reminder queued</span>;
  return (
    <span className={block ? "flex flex-col gap-1" : "flex flex-col items-end gap-1"}>
      <Button
        className={block ? "w-full sm:w-auto" : undefined}
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendReminder(leaseId);
            setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Sending…" : label}
      </Button>
      {msg && !msg.ok && <span className="fade-in max-w-48 text-right text-[13px] text-unpaid">{msg.text}</span>}
    </span>
  );
}
