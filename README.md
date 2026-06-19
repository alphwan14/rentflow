# RentFlow

A digital rent ledger & receipt system for landlords and caretakers in Kenya/East
Africa. RentFlow replaces receipt books and notebooks with **trust, proof and
simplicity**: every payment is authenticated, timestamped, traceable and undeniable.

This is a single-landlord MVP focused on rent tracking, tenant records, receipts,
ledgers, balances, statements and SMS confirmations.

## Core principle: immutable events in, derived truth out

RentFlow never stores or edits a balance. The balance is always `SUM()` over an
append-only ledger. This is what makes it dispute-proof.

- **`ledger_entries`** is the single source of financial truth. Append-only.
  Every charge / payment / adjustment writes exactly one signed entry, in the same
  transaction.
- **Balance = `SUM(ledger_entries.amount)`** — positive = owes, negative = credit.
- **Money is integer cents** (BIGINT) everywhere — never floats.
- Corrections happen via reversal entries, never edits/deletes.
- Receipts are **frozen point-in-time snapshots**.

## Payment allocation (FIFO)

Payments always clear the **oldest unpaid rent first**, automatically. Leftover
becomes forward credit, projected into future months as **"Covered until August
2026."** The rule lives in two mirrored places:

- `src/lib/ledger/allocate.ts` — pure, tested TypeScript engine (read/preview side).
- `record_payment` / `tenant_financials` SQL functions — server-authoritative write side.

The TS engine is fully unit-tested (`npm test`) and is the specification oracle.

## Tech stack

- Next.js (App Router) + TypeScript + TailwindCSS v4
- Supabase (PostgreSQL + Auth + RLS)
- NestJS planned later — the pure engine and SQL RPCs are the seam it will reuse.

## Project layout

```
src/lib/ledger/        Pure financial core (money, periods, allocation, status) + tests
src/lib/supabase/      Browser/server clients, DB types
src/lib/auth/          Auth actions + profile helper
src/app/(app)/         Authenticated app: dashboard, tenants, receipts, statements
supabase/migrations/   Schema, functions (record_payment etc.), RLS policies
```

## Setup

1. Create a Supabase project.
2. Copy env: `cp .env.local.example .env.local` and fill in the URL + anon key.
3. Apply migrations: `supabase link --project-ref <ref>` then `supabase db push`
   (or run the SQL in `supabase/migrations/` in order via the SQL editor).
4. In Supabase Auth settings, enable Email/Password.
5. `npm install && npm run dev`, then sign up → onboarding creates your org (admin).

## Scripts

```bash
npm run dev     # dev server
npm test        # run the allocation/status unit tests
npm run build   # production build
npm run lint    # eslint
```

## Roles

- **Admin** — full access; manages tenants and units.
- **Staff/Caretaker** — records payments. Every payment tracks who recorded it,
  the timestamp and the receipt number.

## SMS (outbox)

Recording a payment enqueues a `sms_messages` row (rendered receipt body). A worker
(future NestJS / Edge Function) sends it via Africa's Talking / Twilio and updates
status — a flaky gateway never blocks a recorded payment.
