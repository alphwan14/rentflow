import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/auth/routing";

/**
 * Code-exchange landing point for every code-carrying auth link:
 *  - Google OAuth (PKCE)
 *  - Supabase DEFAULT email templates (signup confirmation, password
 *    recovery): GoTrue verifies the token, then redirects here with ?code=.
 * After exchanging the code we apply the shared post-auth routing rule
 * (`next` is validated against open redirects in decidePostAuthPath).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  // GoTrue redirects failed verifications (expired/used links) here with
  // error params instead of a code. Surface them on the login page.
  const errorDescription = url.searchParams.get("error_description");
  if (!code) {
    const message = errorDescription ?? "missing_code";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // PKCE requires the browser that started the flow. If an email link is
    // opened elsewhere, GoTrue already verified the token before redirecting
    // here — the account is fine, only this device lacks the code verifier.
    const crossDevice = /code verifier/i.test(error.message);
    const message = crossDevice
      ? "That link was opened in a different browser. Your email is verified — sign in below, or request a new link from this device."
      : error.message;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin)
    );
  }

  const dest = await resolvePostAuthRedirect(supabase, next);
  return NextResponse.redirect(new URL(dest, url.origin));
}
