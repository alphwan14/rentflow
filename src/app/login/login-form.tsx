"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <SubmitButton pendingText="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
