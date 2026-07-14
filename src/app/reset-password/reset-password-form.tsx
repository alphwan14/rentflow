"use client";

import { useActionState } from "react";
import { updatePassword, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" hint="At least 6 characters.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Saving…" className="w-full">
        Save new password
      </SubmitButton>
    </form>
  );
}
