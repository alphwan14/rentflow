"use client";

import { useState, useTransition } from "react";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { confirmPayment, ignorePayment } from "@/server/actions/inbox";
import type { PaymentEventRow } from "@/server/types";
import { Alert, Button, Pill, cx, inputClass } from "@/ui";

export interface LeaseOption {
  leaseId: string;
  label: string;
  buildingId: string;
}

type Item = Pick<
  PaymentEventRow,
  "id" | "trans_code" | "amount_cents" | "occurred_at" | "payer_phone" | "payer_phone_masked" | "payer_name" | "account_ref" | "status" | "confidence" | "suggestion" | "building_id"
>;

/** "Who paid this?" — one tap to confirm the best guess, or pick someone else. */
export function InboxList({ events, leases, compact = false }: { events: Item[]; leases: LeaseOption[]; compact?: boolean }) {
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div>
      {flash && (
        <div className="px-5 pb-3">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line">
        {events.map((e) => (
          <InboxItem key={e.id} e={e} leases={leases} compact={compact} onDone={setFlash} />
        ))}
      </ul>
    </div>
  );
}

function InboxItem({
  e,
  leases,
  compact,
  onDone,
}: {
  e: Item;
  leases: LeaseOption[];
  compact: boolean;
  onDone: (f: { tone: "success" | "error"; text: string }) => void;
}) {
  const [pending, start] = useTransition();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const best = e.suggestion?.best ?? null;
  const options = e.building_id ? leases.filter((l) => l.buildingId === e.building_id) : leases;
  const phone = e.payer_phone ? formatPhone(e.payer_phone) : e.payer_phone_masked;

  const confirm = (leaseIds: string[], label: string) =>
    start(async () => {
      const r = await confirmPayment(e.id, leaseIds);
      if (!r.ok) return onDone({ tone: "error", text: r.error });
      const more = r.data?.alsoMatched ? ` RentFlow learned this payer and matched ${r.data.alsoMatched} more.` : "";
      onDone({ tone: "success", text: `${formatKES(e.amount_cents)} posted to ${label}.${more}` });
    });

  return (
    <li className={cx("px-5 py-4 transition-opacity", pending && "pointer-events-none opacity-50")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[18px] font-semibold">{formatKES(e.amount_cents)}</span>
            <span className="text-[13px] text-muted">
              {formatDate(e.occurred_at.slice(0, 10))} · <span className="num">{e.trans_code}</span>
            </span>
          </div>
          <div className="mt-1 text-[14px] text-ink-2">
            {e.payer_name || "Unknown payer"}
            {phone && <span className="num text-muted"> · {phone}</span>}
            {e.account_ref ? (
              <span className="text-muted">
                {" "}
                · Account <span className="font-medium text-ink-2">“{e.account_ref}”</span>
              </span>
            ) : (
              <span className="text-muted"> · No account given</span>
            )}
          </div>
          {best && !compact && (
            <ul className="mt-2 space-y-0.5 text-[13px] text-muted">
              {best.reasons.slice(0, 3).map((r, i) => (
                <li key={i}>· {r.detail}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
          {best && !picking && (
            <div className="flex items-center gap-2 md:justify-end">
              <Pill tone="accent">Best guess · {Math.round((best.score ?? 0) * 100)}%</Pill>
            </div>
          )}
          {!picking ? (
            <div className="flex flex-wrap gap-2 md:justify-end">
              {best && (
                <Button size="sm" onClick={() => confirm(best.leaseIds, best.label)}>
                  Yes, {best.label}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
                {best ? "Someone else" : "Choose tenant"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  start(async () => {
                    const r = await ignorePayment(e.id);
                    onDone(r.ok ? { tone: "success", text: "Marked as not rent." } : { tone: "error", text: r.error });
                  })
                }
              >
                Not rent
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(ev) => {
                ev.preventDefault();
                const opt = options.find((o) => o.leaseId === choice);
                if (opt) confirm([opt.leaseId], opt.label);
              }}
            >
              <select aria-label="Tenant" value={choice} onChange={(ev) => setChoice(ev.target.value)} className={cx(inputClass, "h-9 text-[14px] sm:w-64")} required>
                <option value="">Pick a tenant…</option>
                {options.map((o) => (
                  <option key={o.leaseId} value={o.leaseId}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="sm" type="submit" disabled={!choice}>
                  Post
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setPicking(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
