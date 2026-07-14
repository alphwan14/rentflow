import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/auth/routing";

/**
 * Email-link landing point.
 *  - Customized templates (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...`)
 *    are consumed server-side via verifyOtp — works cross-device.
 *  - Supabase DEFAULT templates redirect with ?code= instead; that is
 *    forwarded to the same exchange logic as /auth/callback, so this route
 *    works on the Free plan without any template customization.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    }
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/reset-password", url.origin));
    }
    const dest = await resolvePostAuthRedirect(supabase, next);
    return NextResponse.redirect(new URL(dest, url.origin));
  }

  if (code) {
    // Default-template link landed here: same handling as /auth/callback.
    const forward = new URL("/auth/callback", url.origin);
    forward.searchParams.set("code", code);
    if (next) forward.searchParams.set("next", next);
    return NextResponse.redirect(forward);
  }

  const errorDescription = url.searchParams.get("error_description");
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(errorDescription ?? "invalid_link")}`, url.origin)
  );
}
