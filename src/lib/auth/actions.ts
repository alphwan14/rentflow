"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | null;

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) {
    return { error: "Enter an email and a password of at least 6 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // Email confirmation may be required depending on project settings. If a
  // session exists, go straight to onboarding.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) redirect("/onboarding");
  return { error: "Check your email to confirm your account, then sign in." };
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
