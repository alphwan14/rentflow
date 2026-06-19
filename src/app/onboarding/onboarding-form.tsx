"use client";

import { useActionState } from "react";
import { bootstrapAccount, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function OnboardingForm() {
  const [state, action] = useActionState<ActionState, FormData>(bootstrapAccount, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name">
        <Input name="full_name" type="text" required placeholder="Jane Wanjiru" />
      </Field>
      <Field label="Property / business name" hint="Shown on receipts and statements.">
        <Input name="org_name" type="text" required placeholder="Wanjiru Apartments" />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Setting up…" className="w-full">
        Finish setup
      </SubmitButton>
    </form>
  );
}
