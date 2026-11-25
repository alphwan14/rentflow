"use client";

import { useState, useTransition } from "react";
import { reversePayment } from "@/server/actions/inbox";
import { Button } from "@/ui";

/** Undo a wrongly matched payment. History is kept; the payment goes back to "Who paid this?". */
export function ReverseButton({ paymentId }: { paymentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[12px] text-unpaid">{error}</span>}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          const note = window.prompt("Why reverse this payment? It will go back to “Who paid this?”.", "Wrong tenant");
          if (note === null) return;
          start(async () => {
            const r = await reversePayment(paymentId, note);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        {pending ? "Reversing…" : "Not theirs? Reverse"}
      </Button>
    </div>
  );
}
