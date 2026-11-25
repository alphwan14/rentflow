"use client";

import { Building2, CreditCard, House, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./index";

export const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/units", label: "Units", icon: Building2 },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

/** Desktop: pills in the header. */
export function TopNav({ badge }: { badge: number }) {
  const active = useActive();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={cx(
            "flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors duration-150",
            active(n.href) ? "bg-accent text-white" : "text-ink hover:bg-card",
          )}
        >
          {n.label}
          {n.href === "/payments" && badge > 0 && (
            <span className={cx("tnum rounded-full px-1.5 text-[12px] leading-5 font-semibold", active(n.href) ? "bg-white/20" : "bg-ink text-white")}>{badge}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Phone: tab bar fixed to the bottom of the screen. */
export function BottomNav({ badge }: { badge: number }) {
  const active = useActive();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => {
          const on = active(n.href);
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium", on ? "text-accent" : "text-muted")}
              >
                <Icon size={22} strokeWidth={1.5} aria-hidden />
                {n.label}
                {n.href === "/payments" && badge > 0 && (
                  <span className="tnum absolute top-2 left-1/2 ml-2 rounded-full bg-ink px-1.5 text-[11px] leading-4 font-semibold text-white">{badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
