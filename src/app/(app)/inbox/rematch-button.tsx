"use client";

import { useState, useTransition } from "react";
import { rematchAll } from "@/server/actions/inbox";
import { Button } from "@/ui";

export function RematchButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-[13px] text-muted">{msg}</span>}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await rematchAll();
            setMsg(r.ok ? (r.data?.matched ? `Matched ${r.data.matched} more` : "No new matches") : r.error);
          })
        }
      >
        {pending ? "Matching…" : "Try matching again"}
      </Button>
    </div>
  );
}
