"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { firstName } from "@/core/messages";
import { formatKES } from "@/core/money";
import { formatDate } from "@/core/period";
import { formatPhone } from "@/core/phone";
import { confirmPayment, ignorePayment } from "@/server/actions/inbox";
import type { PaymentEventRow } from "@/server/types";
import { Button, Card, List, Notice, cx, inputClass } from "@/ui";

export interface TenantOption {
  leaseId: string;
  unitCode: string;
  name: string;
  buildingId: string;
}

type Item = Pick<PaymentEventRow, "id" | "trans_code" | "amount_cents" | "occurred_at" | "payer_phone" | "payer_phone_masked" | "payer_name" | "account_ref" | "suggestion" | "building_id">;

function guessFor(e: Item, tenants: TenantOption[]) {
  const ids = e.suggestion?.best?.leaseIds ?? [];
  const ts = ids.map((id) => tenants.find((t) => t.leaseId === id)).filter((t): t is TenantOption => !!t);
  if (!ts.length) return null;
  const names = [...new Set(ts.map((t) => t.name))];
  return {
    leaseIds: ts.map((t) => t.leaseId),
    who: names.length === 1 ? names[0] : names.join(" and "),
    first: names.length === 1 ? firstName(names[0]) : names.map(firstName).join(" and "),
    units: ts.map((t) => t.unitCode).join(" and "),
  };
}

function payer(e: Item) {
  const phone = e.payer_phone ? formatPhone(e.payer_phone) : e.payer_phone_masked;
  return [e.payer_name ? titleCase(e.payer_name) : "Unknown payer", phone].filter(Boolean).join(" · ");
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function learnedText(e: Item, alsoMatched: number) {
  const base = e.payer_phone ? "Got it. Next time we'll match this number automatically." : "Got it. We'll remember this payer next time.";
  return alsoMatched ? `${base} We also matched ${alsoMatched} more ${alsoMatched === 1 ? "payment" : "payments"} from them.` : base;
}

/** Full cards for the "Who paid this?" page. */
export function WhoPaidCards({ events, tenants }: { events: Item[]; tenants: TenantOption[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {events.map((e) =>
        done[e.id] ? (
          <Notice key={e.id} tone="success">
            {done[e.id]}
          </Notice>
        ) : (
          <WhoPaidCard key={e.id} e={e} tenants={tenants} onDone={(t) => setDone((d) => ({ ...d, [e.id]: t }))} />
        ),
      )}
    </div>
  );
}

function WhoPaidCard({ e, tenants, onDone }: { e: Item; tenants: TenantOption[]; onDone: (text: string) => void }) {
  const [pending, start] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const guess = guessFor(e, tenants);
  const options = e.building_id ? tenants.filter((t) => t.buildingId === e.building_id) : tenants;

  const confirm = (leaseIds: string[]) =>
    start(async () => {
      setError(null);
      const r = await confirmPayment(e.id, leaseIds);
      if (!r.ok) return setError(r.error);
      onDone(learnedText(e, r.data?.alsoMatched ?? 0));
    });

  return (
    <Card className={cx("p-6 transition-opacity duration-150", pending && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="money text-[28px] leading-tight">{formatKES(e.amount_cents)}</div>
        <div className="text-[13px] text-muted">{formatDate(e.occurred_at.slice(0, 10))}</div>
      </div>
      <div className="mt-1 text-[15px]">{payer(e)}</div>
      <div className="text-[13px] text-muted">{e.account_ref ? `Account typed: “${e.account_ref}”` : "No account number typed"}</div>

      {guess && !choosing && (
        <p className="mt-4 rounded-xl bg-page px-4 py-3 text-[15px]">
          Looks like <span className="font-medium">{guess.who}</span>, {guess.units}
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}

      {!choosing ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {guess && (
            <Button size="lg" className="sm:flex-1" disabled={pending} onClick={() => confirm(guess.leaseIds)}>
              Yes, that&apos;s {guess.first}
            </Button>
          )}
          <Button size="lg" variant="secondary" className="sm:flex-1" disabled={pending} onClick={() => setChoosing(true)}>
            {guess ? "Choose someone else" : "Choose who paid"}
          </Button>
        </div>
      ) : (
        <form
          className="mt-5 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (choice) confirm([choice]);
          }}
        >
          <label htmlFor={`who-${e.id}`} className="block text-[13px] font-medium">
            Who paid this?
          </label>
          <select id={`who-${e.id}`} value={choice} onChange={(ev) => setChoice(ev.target.value)} className={inputClass} required>
            <option value="">Choose a tenant</option>
            {options.map((o) => (
              <option key={o.leaseId} value={o.leaseId}>
                {o.unitCode} · {o.name}
              </option>
            ))}
          </select>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="lg" className="sm:flex-1" disabled={!choice || pending}>
              Save
            </Button>
            <Button size="lg" variant="ghost" className="sm:flex-1" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="mt-3 text-center sm:text-left">
        <button
          type="button"
          className="min-h-11 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await ignorePayment(e.id);
              if (!r.ok) return setError(r.error);
              onDone("Marked as not rent. It won't count towards any tenant.");
            })
          }
        >
          This isn&apos;t rent
        </button>
      </div>
    </Card>
  );
}

/** Compact rows for the home screen tab. */
export function WhoPaidRows({ events, tenants }: { events: Item[]; tenants: TenantOption[] }) {
  return (
    <List>
      {events.map((e) => (
        <WhoPaidRow key={e.id} e={e} tenants={tenants} />
      ))}
    </List>
  );
}

function WhoPaidRow({ e, tenants }: { e: Item; tenants: TenantOption[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const guess = guessFor(e, tenants);
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <div className="money text-[15px]">{formatKES(e.amount_cents)}</div>
        <div className="truncate text-[13px] text-muted">{payer(e)}</div>
        {result ? (
          <div className={cx("fade-in text-[13px]", result.ok ? "text-paid" : "text-unpaid")}>{result.text}</div>
        ) : guess ? (
          <div className="truncate text-[13px]">
            Looks like {guess.who}, {guess.units}
          </div>
        ) : (
          <div className="text-[13px] text-muted">We couldn&apos;t tell who paid</div>
        )}
      </div>
      {!result?.ok &&
        (guess ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await confirmPayment(e.id, guess.leaseIds);
                setResult(r.ok ? { ok: true, text: `Matched to ${guess.first}` } : { ok: false, text: r.error });
              })
            }
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
        ) : (
          <Link href="/payments/who-paid" className="inline-flex h-11 items-center rounded-xl border border-line-strong px-3.5 text-[13px] font-medium hover:bg-page">
            Choose
          </Link>
        ))}
    </li>
  );
}
