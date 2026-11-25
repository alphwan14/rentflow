"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { formatKES } from "@/core/money";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { buttonClass, cx } from "./index";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "lg",
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass(variant, size), className)}>
      {pending ? (pendingText ?? "Please wait…") : children}
    </button>
  );
}

/** Refreshes the page when a payment for this account arrives or is matched. */
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

/** Counts a money figure up once, on first view. Respects reduced motion. */
export function CountUpMoney({ cents, className }: { cents: number; className?: string }) {
  const [shown, setShown] = useState(cents);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || cents <= 0) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round((cents * eased) / 100) * 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame((t) => {
      setShown(0);
      tick(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [cents]);
  return <span className={cx("money", className)}>{formatKES(shown)}</span>;
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
