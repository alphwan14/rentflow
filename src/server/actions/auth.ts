"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizePhone } from "@/core/phone";
import { env } from "../env";
import { supabaseServer } from "../supabase";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().email("Enter your email address"),
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
  if (error) return { error: /invalid login/i.test(error.message) ? "Wrong email or password." : /not confirmed/i.test(error.message) ? "Confirm your email first. Check your inbox for our link." : "We couldn't sign you in. Try again." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ name: z.string().trim().min(2, "Enter your name"), phone: z.string().trim().optional() })
    .safeParse({ email: form.get("email"), password: form.get("password"), name: form.get("name"), phone: form.get("phone") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return { error: "That phone number doesn't look right. Use a Kenyan mobile like 0712 345 678, or leave it empty." };
  const db = await supabaseServer();
  const { data, error } = await db.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name, ...(phone ? { phone } : {}) },
      emailRedirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
    },
  });
  if (error) {
    if (/already registered/i.test(error.message)) return { error: "There's already an account with that email. Sign in instead." };
    if (/rate limit/i.test(error.message)) return { error: "Too many tries. Wait a minute and try again." };
    return { error: "We couldn't create your account. Check your details and try again." };
  }
  if (!data.session) return { message: "Check your email. We sent a link to confirm your account." };
  redirect(safeNext(form.get("next")) === "/home" ? "/onboarding" : safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}
