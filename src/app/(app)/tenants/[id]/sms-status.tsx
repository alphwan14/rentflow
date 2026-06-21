"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TONE_CLASSES } from "@/lib/ledger/present";
import { SMS_STEPS, presentSmsStatus } from "@/lib/sms/status";
import type { SmsMessage } from "@/lib/supabase/types";

/**
 * Live SMS receipt status for one tenant. Seeds from the server-rendered rows,
 * then subscribes to Supabase realtime so status changes (worker sends, AT
 * delivery reports) animate in without a refresh. Read-only: it never writes.
 */
export function SmsStatusPanel({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: SmsMessage[];
}) {
  const [messages, setMessages] = useState<SmsMessage[]>(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sms-status:${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          setMessages((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((m) => m.id !== oldId);
            }
            const row = payload.new as SmsMessage;
            const next = prev.some((m) => m.id === row.id)
              ? prev.map((m) => (m.id === row.id ? row : m))
              : [row, ...prev];
            return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
          });
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">SMS receipts</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`}
            aria-hidden
          />
          {live ? "Live" : "Connecting…"}
        </span>
      </div>

      {messages.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No SMS yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {messages.map((m) => (
            <SmsRow key={m.id} message={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SmsRow({ message }: { message: SmsMessage }) {
  const view = presentSmsStatus(message.status);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{message.to_phone}</p>
          <p className="text-xs text-slate-400">
            {new Date(message.created_at).toLocaleString("en-KE", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[view.tone]}`}
        >
          {view.label}
        </span>
      </div>

      <SmsTimeline view={view} />

      {view.failed && message.error ? (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{message.error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">{view.detail}</p>
      )}
    </li>
  );
}

/** Horizontal stepper: filled up to the furthest-reached step; red if failed. */
function SmsTimeline({ view }: { view: ReturnType<typeof presentSmsStatus> }) {
  return (
    <div className="mt-2.5 flex items-center gap-1">
      {SMS_STEPS.map((step, i) => {
        const reached = !view.failed && i <= view.stepIndex;
        const current = !view.failed && i === view.stepIndex;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full ${
                view.failed ? "bg-red-200" : reached ? "bg-emerald-500" : "bg-slate-200"
              }`}
            />
            <span
              className={`text-[10px] ${
                current ? "font-semibold text-emerald-700" : reached ? "text-slate-500" : "text-slate-300"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
