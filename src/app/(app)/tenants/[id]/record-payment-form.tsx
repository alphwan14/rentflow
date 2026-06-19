"use client";

import { useActionState } from "react";
import { recordPayment, type FormState } from "@/lib/tenants/actions";
import { ErrorText, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function RecordPaymentForm({ tenantId, today }: { tenantId: string; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(recordPayment, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (KES)">
          <Input name="amount" type="number" min="1" step="1" required placeholder="15000" autoFocus />
        </Field>
        <Field label="Method">
          <Select name="method" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date received">
          <Input name="paid_at" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Note">
          <Input name="note" placeholder="Optional" />
        </Field>
      </div>
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Recording…">Record payment &amp; issue receipt</SubmitButton>
    </form>
  );
}
