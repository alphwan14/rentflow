"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation for the authenticated app.
 *  - Mobile: fixed bottom tab bar (thumb-reachable, nothing hidden behind a
 *    drawer — we only have three destinations).
 *  - Desktop (md+): links in the existing top bar, now with an active state.
 */

const DESTINATIONS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/tenants",
    label: "Tenants",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop top-bar links (md+ only; the layout hides them on mobile). */
export function TopNavLinks() {
  const pathname = usePathname();
  return (
    <>
      {DESTINATIONS.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={`rounded-lg px-3 py-2 font-medium transition ${
            isActive(pathname, d.href)
              ? "bg-brand/10 text-brand"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {d.label}
        </Link>
      ))}
    </>
  );
}

/** Mobile bottom tab bar. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-5xl">
        {DESTINATIONS.map((d) => {
          const active = isActive(pathname, d.href);
          return (
            <Link
              key={d.href}
              href={d.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition ${
                active ? "text-brand" : "text-slate-500"
              }`}
            >
              {d.icon}
              {d.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
