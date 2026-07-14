import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The single post-auth routing rule, applied after EVERY auth event (password
 * sign-in, Google callback, email confirmation, password reset):
 *
 *   1. a safe internal `next` path wins (invite links ride through here)
 *   2. user has a profile        -> /dashboard
 *   3. pending invite for email  -> /onboarding?invite=1 (shows Join banner)
 *   4. otherwise                 -> /onboarding (create a new organization)
 */

/** Only same-origin paths: must start with "/", never "//" or a scheme. */
export function isSafeInternalPath(next: string | null | undefined): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.includes("://") || next.includes("\\")) return false;
  return true;
}

export function decidePostAuthPath(input: {
  hasProfile: boolean;
  hasPendingInvite: boolean;
  next?: string | null;
}): string {
  if (isSafeInternalPath(input.next)) return input.next;
  if (input.hasProfile) return "/dashboard";
  if (input.hasPendingInvite) return "/onboarding?invite=1";
  return "/onboarding";
}

/** Fetch profile + pending invite for the signed-in user and decide the path. */
export async function resolvePostAuthRedirect(
  supabase: SupabaseClient,
  next?: string | null
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  let hasPendingInvite = false;
  if (!profile) {
    // RPC ships with the org_invites migration; tolerate its absence so the
    // frontend can deploy ahead of the database.
    const { data: invite, error } = await supabase.rpc("pending_invite_for_me");
    hasPendingInvite = !error && invite != null;
  }

  return decidePostAuthPath({ hasProfile: !!profile, hasPendingInvite, next });
}
