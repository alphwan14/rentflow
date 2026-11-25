"use client";

import { useActionState } from "react";
import { createOrg, type FormState } from "@/server/actions/org";
import { Alert, Card, Field, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

export function CreateOrgForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState<FormState, FormData>(createOrg, undefined);
  return (
    <Card className="mt-6 p-5 sm:p-6">
      <form action={action} className="space-y-4">
        <Field label="Landlord or company name" htmlFor="name" hint="For example “Kamau Properties” or “Grace Wanjiku”">
          <input id="name" name="name" required minLength={2} className={inputClass} autoFocus />
        </Field>
        <Field label="Your name" htmlFor="your_name">
          <input id="your_name" name="your_name" defaultValue={defaultName} className={inputClass} />
        </Field>
        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton pendingText="Creating…">Continue</SubmitButton>
      </form>
    </Card>
  );
}
