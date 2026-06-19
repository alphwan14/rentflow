import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly "middleware"): runs before matched
// routes to refresh the Supabase session and guard authenticated pages.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets, image optimization, and public SEO
  // files (robots.txt / sitemap.xml must be reachable by crawlers without auth).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
