"use client";

import { useState, useTransition } from "react";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { adminRecordSubscriptionPayment, adminUpdateSubscription } from "@/server/actions/admin";
import { Button, Field, Notice, inputClass } from "@/ui";

export function RecordPaymentForm({ orgId, monthlyCents, today }: { orgId: string; monthlyCents: number; today: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [months, setMonths] = useState(1);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await adminRecordSubscriptionPayment(orgId, f);
          setMsg(r.ok ? { ok: true, text: `Saved. Paid up to ${formatDate(r.data!.paidUntil)}.` } : { ok: false, text: r.error });
          if (r.ok) form.reset();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount (KES)" htmlFor="sp-amount" hint={monthlyCents ? `${formatKES(monthlyCents * months)} for ${months} ${months === 1 ? "month" : "months"}` : undefined}>
          <input id="sp-amount" name="amount" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label="Months it covers" htmlFor="sp-months">
          <select id="sp-months" name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputClass}>
            {[1, 2, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date paid" htmlFor="sp-date">
          <input id="sp-date" name="paid_on" type="date" defaultValue={today} max={today} required className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="How they paid" htmlFor="sp-method">
          <select id="sp-method" name="method" defaultValue="mpesa" className={inputClass}>
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Reference (optional)" htmlFor="sp-ref" hint="M-Pesa code or bank reference">
          <input id="sp-ref" name="reference" className={inputClass} />
        </Field>
        <Field label="Note (optional)" htmlFor="sp-note">
          <input id="sp-note" name="note" className={inputClass} />
        </Field>
      </div>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}

export function SubscriptionForm({
  orgId,
  status,
  trialEnds,
  priceOverride,
  notes,
}: {
  orgId: string;
  status: "trial" | "active" | "cancelled";
  trialEnds: string | null;
  priceOverride: number | null;
  notes: string | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await adminUpdateSubscription(orgId, f);
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="sub-status">
          <select id="sub-status" name="status" defaultValue={status} className={inputClass}>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Trial ends" htmlFor="sub-trial">
          <input id="sub-trial" name="trial_ends" type="date" defaultValue={trialEnds ?? ""} className={inputClass} />
        </Field>
        <Field label="Special price per unit (KES)" htmlFor="sub-price" hint="Leave empty for the plan price">
          <input id="sub-price" name="price_override" inputMode="decimal" defaultValue={priceOverride !== null ? String(priceOverride / 100) : ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="sub-notes">
        <input id="sub-notes" name="notes" defaultValue={notes ?? ""} className={inputClass} />
      </Field>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
