"use client";

import { useActionState } from "react";
import { createTenant, type FormState } from "@/lib/tenants/actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";

export function NewTenantForm({ today }: { today: string }) {
  const [state, action] = useActionState<FormState, FormData>(createTenant, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input name="full_name" required placeholder="John Mwangi" />
        </Field>
        <Field label="Phone" hint="For SMS receipts.">
          <Input name="phone" type="tel" placeholder="+2547…" />
        </Field>
        <Field label="Room / unit" hint="Created automatically if new.">
          <Input name="unit_label" placeholder="A2" />
        </Field>
        <Field label="Monthly rent (KES)">
          <Input name="monthly_rent" type="number" min="1" step="1" required placeholder="10000" />
        </Field>
        <Field label="Rent due day" hint="Day of month (1–31).">
          <Input name="due_day" type="number" min="1" max="31" defaultValue={1} required />
        </Field>
        <Field label="Move-in date">
          <Input name="move_in_date" type="date" defaultValue={today} max={today} required />
        </Field>
      </div>
      <Field label="Notes">
        <Input name="notes" placeholder="Optional" />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">Save tenant</SubmitButton>
        <Link href="/dashboard">
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
