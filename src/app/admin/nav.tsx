"use client";

import { Building2, Gauge, MessageSquare, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/ui";

const ITEMS = [
  { href: "/admin", label: "Landlords", icon: Users },
  { href: "/admin/buildings", label: "Buildings", icon: Building2 },
  { href: "/admin/plans", label: "Plans", icon: Gauge },
  { href: "/admin/agents", label: "Agents", icon: UserRound },
  { href: "/admin/sms", label: "SMS usage", icon: MessageSquare },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-3 md:pb-0">
      {ITEMS.map((it) => {
        const on = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={cx("flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-[15px] whitespace-nowrap", on ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
