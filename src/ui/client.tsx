"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { buttonClass, cx } from "./index";

export function SubmitButton({ children, pendingText, variant = "primary", className }: { children: ReactNode; pendingText?: string; variant?: "primary" | "secondary"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass(variant), className)}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function NavPills({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/home" && path.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors",
              active ? "bg-accent text-accent-ink" : "bg-card text-ink-2 hover:text-ink border border-line/70",
            )}
          >
            {it.label}
            {!!it.badge && (
              <span className={cx("num rounded-full px-1.5 text-[11px] leading-5 font-semibold", active ? "bg-white/25" : "bg-accent text-accent-ink")}>
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Subscribes to this org's payment events and payments over Supabase Realtime
 * and refreshes the page when something is matched, so new money shows up
 * without a reload.
 */
export function LiveRefresh({ orgId }: { orgId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const db = supabaseBrowser();
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
    };
    const ch = db
      .channel(`org-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_events", filter: `org_id=eq.${orgId}` }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments", filter: `org_id=eq.${orgId}` }, bump)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      db.removeChannel(ch);
    };
  }, [orgId, router]);
  return null;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the text is visible to copy by hand */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
