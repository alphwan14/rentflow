/**
 * Runtime configuration for the frontend. All values come from environment
 * variables — never hardcode hosts/keys. NEXT_PUBLIC_* are inlined at build time
 * and safe to expose to the browser.
 */

/** Supabase (public, RLS-protected). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Base URL of the RentFlow backend (NestJS on Render). Optional today — the app
 * talks to Supabase directly — but configurable so future backend calls switch
 * cleanly between local and production with no code changes.
 *   local:      http://localhost:3001
 *   production: https://rentflow-backend.onrender.com
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
