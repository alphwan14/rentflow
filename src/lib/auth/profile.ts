import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Returns the signed-in user's profile, or null if not signed in / not yet
 * onboarded. Onboarding (creating an org) populates the profile row.
 */
export async function getProfile(): Promise<Profile | null> {
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
}
