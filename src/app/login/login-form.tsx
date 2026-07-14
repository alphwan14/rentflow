"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { GoogleButton } from "@/components/google-button";
import { AuthDivider } from "@/components/auth-divider";

export function LoginForm({ next, urlError }: { next: string | null; urlError: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, null);
  return (
    <div className="space-y-4">
      <GoogleButton next={next} />
      <AuthDivider />
      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <ErrorText>{state?.error ?? urlError}</ErrorText>
        <SubmitButton pendingText="Signing in…" className="w-full">
          Sign in
        </SubmitButton>
        <p className="text-center text-sm text-slate-500">
          New here?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="font-medium text-brand hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
