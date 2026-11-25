"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { todayNairobi } from "@/core/period";
import { reversePayment } from "@/server/actions/inbox";
import { moveOut, recordCashPayment } from "@/server/actions/tenancy";
import { Button, Field, Notice, inputClass } from "@/ui";
import { RemindButton } from "../../_parts/remind-button";

type Panel = null | "cash" | "move-out";

export function TenantActions({
  leaseId,
  owes,
  movedOut = false,
  canMoveOut,
  tenantName,
  startDate,
}: {
  leaseId: string;
  owes: boolean;
  movedOut?: boolean;
  canMoveOut: boolean;
  tenantName: string;
  startDate: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = todayNairobi();

  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      {panel === null && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={() => (setMsg(null), setPanel("cash"))}>Record cash payment</Button>
          {owes && !movedOut && <RemindButton leaseId={leaseId} size="md" label="Send reminder" block />}
          {canMoveOut && !movedOut && (
            <Button variant="ghost" onClick={() => (setMsg(null), setPanel("move-out"))}>
              Move out
            </Button>
          )}
        </div>
      )}

      {panel === "cash" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await recordCashPayment(leaseId, String(f.get("amount")), String(f.get("date")), String(f.get("note") ?? ""));
              setMsg(r.ok ? { ok: true, text: "Payment saved. The SMS receipt will go out once SMS sending is switched on." } : { ok: false, text: r.error });
              if (r.ok) setPanel(null);
            });
          }}
        >
          <h3 className="text-[15px] font-semibold">Record cash payment</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (KES)" htmlFor="cash-amount">
              <input id="cash-amount" name="amount" inputMode="numeric" required placeholder="15,000" className={inputClass} autoFocus />
            </Field>
            <Field label="Date paid" htmlFor="cash-date">
              <input id="cash-date" name="date" type="date" required defaultValue={today} max={today} className={inputClass} />
            </Field>
          </div>
          <Field label="Note (optional)" htmlFor="cash-note" hint="For example, who collected it.">
            <input id="cash-note" name="note" maxLength={120} className={inputClass} />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Save payment"}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {panel === "move-out" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await moveOut(leaseId, String(f.get("date")));
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              router.push("/units");
            });
          }}
        >
          <h3 className="text-[15px] font-semibold">Move {tenantName} out</h3>
          <p className="text-[15px] text-muted">No more rent bills will be added after this date, and the unit will show as empty. Anything they still owe stays in their payment history.</p>
          <Field label="Move-out date" htmlFor="move-date">
            <input id="move-date" name="date" type="date" required defaultValue={today} min={startDate} className={inputClass} />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="danger" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Move out"}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** "Not theirs? Undo payment": sends it back to "Who paid this?". */
export function UndoPaymentButton({ paymentId }: { paymentId: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming)
    return (
      <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
        Not theirs? Undo payment
      </button>
    );
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-[13px]">Undo this payment? It goes back to “Who paid this?”.</span>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reversePayment(paymentId, "Undone by landlord");
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Undoing…" : "Undo payment"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
      {error && <span className="text-[13px] text-unpaid">{error}</span>}
    </div>
  );
}
