import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the anon key and the signed-in user's session, so RLS always applies.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session cookie.
        }
      },
    },
  });
}

export type Db = Awaited<ReturnType<typeof supabaseServer>>;
