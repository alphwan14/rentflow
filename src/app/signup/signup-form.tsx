"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, resendConfirmation, type ActionState } from "@/lib/auth/actions";
import { ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { GoogleButton } from "@/components/google-button";
import { AuthDivider } from "@/components/auth-divider";

/** Shown after signup when email confirmation is required. */
function CheckEmailPanel({ email }: { email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resendConfirmation, null);
  return (
    <div className="space-y-4 text-center">
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
        We sent a confirmation link to <span className="font-semibold">{email}</span>. Open it to
        activate your account.
      </div>
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <SubmitButton pendingText="Sending…" className="w-full" variant="ghost">
          Resend email
        </SubmitButton>
      </form>
      {state?.success ? <p className="text-sm text-slate-500">{state.success}</p> : null}
      <ErrorText>{state?.error}</ErrorText>
      <p className="text-sm text-slate-500">
        Already confirmed?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function SignupForm({ next }: { next: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(
    async (prev: ActionState, formData: FormData) => {
      // Keep the submitted email around so the check-email panel can resend.
      const result = await signUp(prev, formData);
      if (result?.success) {
        return { ...result, email: String(formData.get("email") ?? "") } as ActionState & {
          email?: string;
        };
      }
      return result;
    },
    null
  );

  const submitted = state as (ActionState & { email?: string }) | null;
  if (submitted?.success && submitted.email) {
    return <CheckEmailPanel email={submitted.email} />;
  }

  return (
    <div className="space-y-4">
      <GoogleButton next={next} />
      <AuthDivider />
      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
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
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="font-medium text-brand hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
