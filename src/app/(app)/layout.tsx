import Link from "next/link";
import { signOut } from "@/server/actions/auth";
import { switchOrg } from "@/server/actions/org";
import { requireOrg } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { cx } from "@/ui";
import { Brand } from "@/ui/brand";
import { LiveRefresh, NavPills } from "@/ui/client";
import { IconChevronDown } from "@/ui/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireOrg();
  const db = await supabaseServer();
  const { count } = await db
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", s.org.orgId)
    .in("status", ["pending", "suggested", "unmatched"]);

  const initials = (s.name ?? s.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <LiveRefresh orgId={s.org.orgId} />
      <header className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <div className="sm:hidden">
            <AccountMenu initials={initials} s={s} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <NavPills
            items={[
              { href: "/home", label: "Home" },
              { href: "/inbox", label: "Who paid this?", badge: count ?? 0 },
              { href: "/buildings", label: "Buildings" },
              { href: "/tenants", label: "Tenants" },
              { href: "/statements", label: "Statements" },
            ]}
          />
        </div>
        <div className="hidden sm:block">
          <AccountMenu initials={initials} s={s} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function AccountMenu({ initials, s }: { initials: string; s: Awaited<ReturnType<typeof requireOrg>> }) {
  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line/70 bg-card py-1 pr-3 pl-1 [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{initials}</span>
        <span className="hidden max-w-36 truncate text-[13px] font-medium md:block">{s.org.orgName}</span>
        <IconChevronDown size={14} className="text-muted" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-card p-2 shadow-lg">
        <div className="px-3 py-2">
          <div className="truncate text-[14px] font-medium">{s.name ?? s.email}</div>
          <div className="truncate text-[12px] text-muted">{s.email}</div>
        </div>
        {s.orgs.length > 1 && (
          <div className="border-t border-line py-1">
            {s.orgs.map((o) => (
              <form key={o.orgId} action={switchOrg.bind(null, o.orgId)}>
                <button
                  className={cx(
                    "w-full truncate rounded-lg px-3 py-2 text-left text-[14px] hover:bg-page",
                    o.orgId === s.org.orgId && "font-medium text-accent",
                  )}
                >
                  {o.orgName}
                </button>
              </form>
            ))}
          </div>
        )}
        <div className="border-t border-line py-1">
          <Link href="/settings" className="block rounded-lg px-3 py-2 text-[14px] hover:bg-page">
            Settings &amp; team
          </Link>
          <Link href="/onboarding/building" className="block rounded-lg px-3 py-2 text-[14px] hover:bg-page">
            Set up a building
          </Link>
          <form action={signOut}>
            <button className="w-full rounded-lg px-3 py-2 text-left text-[14px] text-ink-2 hover:bg-page">Sign out</button>
          </form>
        </div>
      </div>
    </details>
  );
}
