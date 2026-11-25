"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/server/actions/auth";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Card, Field, Notice, buttonClass, cx, inputClass } from "@/ui";
import { SubmitButton } from "@/ui/client";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const nextQ = next ? `?next=${encodeURIComponent(next)}` : "";

  async function google() {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/home")}` },
    });
    if (error) setOauthError("We couldn't open Google sign-in. Try again, or use your email.");
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-[20px] font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-1 text-[15px] text-muted">{mode === "login" ? "See who has paid and who hasn't." : "Free to start. No card needed."}</p>
      <form action={action} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <>
            <Field label="Your name" htmlFor="name">
              <input id="name" name="name" autoComplete="name" required className={inputClass} />
            </Field>
            <Field label="Phone (optional)" htmlFor="phone">
              <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0712 345 678" className={inputClass} />
            </Field>
          </>
        )}
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required className={inputClass} />
        </Field>
        {state?.error && <Notice>{state.error}</Notice>}
        {state?.message && <Notice tone="success">{state.message}</Notice>}
        {oauthError && <Notice>{oauthError}</Notice>}
        <SubmitButton className="w-full" pendingText={mode === "login" ? "Signing in…" : "Creating your account…"}>
          {mode === "login" ? "Sign in" : "Create account"}
        </SubmitButton>
      </form>
      <div className="my-5 flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <button type="button" onClick={google} className={cx(buttonClass("secondary", "lg"), "w-full")}>
        Continue with Google
      </button>
      <p className="mt-6 text-center text-[15px] text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`/signup${nextQ}`} className="font-medium text-accent">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Have an account?{" "}
            <Link href={`/login${nextQ}`} className="font-medium text-accent">
              Sign in
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
