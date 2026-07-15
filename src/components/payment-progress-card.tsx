"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SmsMessage, SmsStatus } from "@/lib/supabase/types";

/**
 * Compact floating progress card shown right after a payment commits (the
 * payment action redirects to the receipt page, which mounts this). It rides
 * the same realtime channel as the permanent SMS panel and narrates:
 *
 *   ✓ Payment recorded → ✓ Receipt generated → (SMS: queued → sending → sent → delivered)
 *
 * Behavior contract:
 *  - only appears for a FRESH payment (the server page passes `initial` only
 *    when the SMS row is minutes old) — opening an old receipt never pops it
 *  - fixed position: never shifts layout, never blocks interaction
 *  - fades away on success; lingers (dismissible) on failure
 */

const FADE_AFTER_DELIVERED_MS = 4_000;
const FADE_AFTER_SENT_MS = 12_000; // delivery reports can lag; the panel takes over
const FADE_ANIMATION_MS = 500;

function SmsLine({ status }: { status: SmsStatus }) {
  switch (status) {
    case "pending":
      return <Step icon="spin" text="Preparing SMS…" />;
    case "sending":
      return <Step icon="spin" text="Sending SMS…" />;
    case "retrying":
      return <Step icon="warn" text="Sending SMS — retrying automatically" />;
    case "sent":
      return <Step icon="ok" text="SMS sent — awaiting delivery confirmation" />;
    case "delivered":
      return <Step icon="ok" text="Delivered ✓" />;
    case "failed":
      return <Step icon="fail" text="SMS delivery failed" />;
  }
}

function Step({ icon, text }: { icon: "ok" | "spin" | "warn" | "fail"; text: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-slate-700">
      {icon === "ok" ? (
        <span className="text-emerald-600" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      ) : icon === "spin" ? (
        <span className="text-brand" aria-hidden>
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
        </span>
      ) : icon === "warn" ? (
        <span className="text-amber-500" aria-hidden>⚠</span>
      ) : (
        <span className="text-red-500" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </span>
      )}
      <span>{text}</span>
    </li>
  );
}

export function PaymentProgressCard({
  paymentId,
  initial,
}: {
  paymentId: string;
  /** Pass null for stale/absent SMS rows — the card then never renders. */
  initial: SmsMessage | null;
}) {
  const [status, setStatus] = useState<SmsStatus | null>(initial?.status ?? null);
  const [dismissed, setDismissed] = useState(false);
  const [fading, setFading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Live status via the already-published sms_messages realtime channel.
  useEffect(() => {
    if (!initial) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`payment-progress:${paymentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sms_messages", filter: `payment_id=eq.${paymentId}` },
        (payload) => {
          const next = (payload.new as SmsMessage).status;
          setStatus(next);
          // A late failure (e.g. delivery report) cancels an in-progress fade.
          if (next === "failed" || next === "retrying") setFading(false);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial, paymentId]);

  // Success states fade the card away; failure keeps it until dismissed.
  // The effect only schedules timers — state changes happen in their callbacks.
  useEffect(() => {
    if (status === "delivered" || status === "sent") {
      const delay = status === "delivered" ? FADE_AFTER_DELIVERED_MS : FADE_AFTER_SENT_MS;
      timers.current.push(setTimeout(() => setFading(true), delay));
      timers.current.push(setTimeout(() => setDismissed(true), delay + FADE_ANIMATION_MS));
    }
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      timers.current = [];
    };
  }, [status]);

  if (!initial || dismissed || status === null) return null;

  return (
    <div
      className="no-print pointer-events-none fixed inset-x-4 bottom-20 z-40 flex justify-end md:bottom-6 md:inset-x-auto md:right-6"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto w-full max-w-xs rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur transition-opacity duration-500 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <ul className="space-y-2">
            <Step icon="ok" text="Payment recorded" />
            <Step icon="ok" text="Receipt generated" />
            <SmsLine status={status} />
          </ul>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="-m-1 rounded p-1 text-slate-300 transition hover:text-slate-500"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {status === "failed" ? (
          <a
            href={`/settings/sms?q=${encodeURIComponent(initial?.to_phone ?? "")}`}
            className="mt-3 block text-sm font-medium text-brand hover:underline"
          >
            View retry details →
          </a>
        ) : null}
      </div>
    </div>
  );
}
