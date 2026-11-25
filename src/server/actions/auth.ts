"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "../env";
import { supabaseServer } from "../supabase";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/home";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message === "Invalid login credentials" ? "Wrong email or password." : error.message };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ name: z.string().trim().min(2, "Enter your name") })
    .safeParse({ email: form.get("email"), password: form.get("password"), name: form.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await supabaseServer();
  const { data, error } = await db.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect(safeNext(form.get("next")) === "/home" ? "/onboarding" : safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}
