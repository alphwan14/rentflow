"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      {state?.success ? (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{state.success}</div>
      ) : null}
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
