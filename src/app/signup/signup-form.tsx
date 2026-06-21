"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

export function SignupForm() {
  const [state, action] = useActionState<ActionState, FormData>(signUp, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password" hint="At least 6 characters.">
        <PasswordInput name="password" autoComplete="new-password" required />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Creating account…" className="w-full">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
