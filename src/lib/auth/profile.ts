import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Returns the signed-in user's profile, or null if not signed in / not yet
 * onboarded. Onboarding (creating an org) populates the profile row.
 *
 * Wrapped in React cache(): layout, page and server actions frequently need
 * the profile in the same request — this dedupes them to one auth check + one
 * profiles read per request (never cached across requests).
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
});
