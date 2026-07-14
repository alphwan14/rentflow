"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect, isSafeInternalPath } from "@/lib/auth/routing";
import { siteUrl } from "@/lib/config";

export type ActionState = { error?: string; success?: string } | null;

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(await resolvePostAuthRedirect(supabase, next));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || password.length < 6) {
    return { error: "Enter an email and a password of at least 6 characters." };
  }

  const supabase = await createClient();
  const emailRedirectTo = `${siteUrl()}/auth/callback${
    isSafeInternalPath(next) ? `?next=${encodeURIComponent(next)}` : ""
  }`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) return { error: error.message };

  // Email confirmation may be required depending on project settings. If a
  // session exists, continue straight through the post-auth routing rule.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) redirect(await resolvePostAuthRedirect(supabase, next));

  return {
    success:
      "Almost there — we sent a confirmation link to your email. Open it to activate your account.",
  };
}

export async function resendConfirmation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email first." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { success: "Confirmation email sent again. Check your inbox (and spam)." };
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  // Works with Supabase's DEFAULT email template (no Pro customization):
  // {{ .ConfirmationURL }} verifies at GoTrue, which then redirects here with
  // a ?code= param. /auth/callback exchanges it and honours next=.
  // (A customized token_hash template would land on /auth/confirm instead —
  // both routes handle both link styles.)
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });

  // Same response whether or not the account exists (no email enumeration).
  return { success: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect(await resolvePostAuthRedirect(supabase));
}

export async function bootstrapAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const orgName = String(formData.get("org_name") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_account", {
    p_org_name: orgName,
    p_full_name: fullName,
  });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
