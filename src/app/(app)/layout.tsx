import Link from "next/link";
import { signOut } from "@/server/actions/auth";
import { switchOrg } from "@/server/actions/org";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { cx } from "@/ui";
import { Wordmark } from "@/ui/brand";
import { LiveRefresh } from "@/ui/client";
import { BottomNav, TopNav } from "@/ui/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireOrg();
  const db = await supabaseServer();
  const { count } = await db
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", s.org.orgId)
    .in("status", ["pending", "suggested", "unmatched"]);
  const badge = count ?? 0;
  const initials = (s.name ?? s.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh">
      <LiveRefresh orgId={s.org.orgId} />
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <TopNav badge={badge} />
        <details className="relative">
          <summary aria-label="Account" className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-full pr-1 [&::-webkit-details-marker]:hidden">
            <span className="hidden max-w-40 truncate text-[13px] text-muted lg:block">{s.org.orgName}</span>
            <span className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-[13px] font-semibold">{initials}</span>
          </summary>
          <div className="fade-in absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-card p-2">
            <div className="px-3 py-2">
              <div className="truncate text-[15px] font-medium">{s.name ?? s.email}</div>
              <div className="truncate text-[13px] text-muted">{s.email}</div>
            </div>
            {s.orgs.length > 1 && (
              <div className="border-t border-line py-1">
                {s.orgs.map((o) => (
                  <form key={o.orgId} action={switchOrg.bind(null, o.orgId)}>
                    <button className={cx("flex min-h-11 w-full items-center truncate rounded-lg px-3 text-left text-[15px] hover:bg-page", o.orgId === s.org.orgId && "font-medium")}>
                      {o.orgName}
                    </button>
                  </form>
                ))}
              </div>
            )}
            <div className="border-t border-line py-1">
              {s.isPlatformAdmin && (
                <Link href="/admin" className="flex min-h-11 items-center rounded-lg px-3 text-[15px] hover:bg-page">
                  RentFlow admin
                </Link>
              )}
              <form action={signOut}>
                <button className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-page">Sign out</button>
              </form>
            </div>
          </div>
        </details>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-2 pb-28 sm:px-6 md:pb-16">{children}</main>
      <BottomNav badge={badge} />
    </div>
  );
}
