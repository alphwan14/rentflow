# RentFlow

RentFlow tells a Kenyan landlord where every shilling of rent is, without ever holding the money. Tenants pay straight into the landlord's own M-Pesa paybill, till or bank account. RentFlow reads the payments, matches each one to a tenant, and keeps the books.

The home screen shows three things: **Collected**, **Still owed** and **Who hasn't paid**.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4), deployed on Vercel. One codebase for the landlord app and, later, the tenant link, caretaker PWA and internal admin.
- **Supabase**: Postgres, Auth, row-level security on every table, and Realtime (matched payments appear without a refresh).
- **pg_cron**: a daily, idempotent rent run (00:05 Nairobi) and late fees (00:35).
- **Vitest** for tests. Database tests run the real migrations in **PGlite** (Postgres 17 in WebAssembly), so no Docker is needed.
- Coming in phase 4: a Node (NestJS) worker on Render using the Postgres job queue (`jobs` table, `claim_jobs()` with `SKIP LOCKED`), and SMS through Africa's Talking.

## Run it

```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL and anon key
npm run dev                      # http://localhost:3000
```

**Demo login:** `demo@rentflow.co.ke` / `rentflow-demo-2026`

The demo is Kasarani Heights: 40 units (A1–A20, B1–B20), 36 tenants, two months of history plus this month, and two payments waiting in "Who paid this?". On **Statements**, click "Download a sample statement" and upload it to watch the pipeline: payments already recorded are recognised, new ones are matched, and the puzzles land in the inbox.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests (matching engine, ledger, parsers, importers) and database tests (migrations, RLS, functions, seed) in PGlite |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |
| `npm run seed:generate` | Regenerate `supabase/seed.sql` from `src/demo/data.ts` |
| `npx supabase db reset --remote` | **Wipes** the linked project, then applies migrations and the seed |
| `npx supabase db push` | Applies new migrations to the linked project |

## How it works

```
statement upload / Daraja C2B / KCB Buni IPN
        │  (source adapters → NormalizedPayment)
        ▼
payment_events        stored once, unique per org by transaction code
        │
        ▼
matching engine       account ref → known phones → payer name (fuzzy) → amount
        │             gives a 0–1 confidence and a decision
        ├─ sure  ──► post_payment: payment + ledger entries (oldest debt first)
        └─ unsure ─► "Who paid this?" inbox with the best guess.
                     One tap to confirm; RentFlow learns the phone/name.
```

- **Money is integer cents** (`bigint`), never floats. Display is "KES 184,000".
- **`ledger_entries` is append-only** (a trigger blocks UPDATE and DELETE). Balances are always summed from it. Corrections are reversal entries.
- **Payments clear the oldest unpaid charge first.** Anything left over is credit, shown as "covered until <month>".
- **Charges are immutable.** Rent is billed for every month from the building's "books from" month. Older debt comes in as "balance brought forward".
- **Auto-posting needs real identity evidence:** a unit code, a known or learned phone, a learned name, or two weaker signals that agree. An unknown number paying an exact rent amount is only ever suggested.

## Code map

```
src/core/            pure TypeScript, no framework imports; shared with the worker later
  money.ts, phone.ts, period.ts, ledger.ts, plans.ts
  matching/          engine.ts, account-ref.ts, similarity.ts (+ engine.test.ts)
  sources/           M-Pesa statement parsers (CSV / Excel / PDF) behind PaymentSourceAdapter
  import/            unit naming patterns, tenant lists, notebook-photo reader (stub)
src/server/          Supabase session, queries, matching service, server actions
src/ui/              design system (cards, stat cards, pills, chart)
src/app/             routes: /home /inbox /buildings /tenants /statements /settings /onboarding /join
src/demo/            demo dataset + sample statement generator
supabase/migrations/ core → money → functions → rls → cron_realtime
supabase/tests/      PGlite database tests
```

## Roles and plans

- **Roles:**
  - owner and manager can do everything
  - caretaker records payments and readings (phase 6)
  - viewer can only read

  Enforced by RLS and inside every SQL function.
- **Plans** (`orgs.plan`), set by RentFlow staff (`platform_admins`). Billing comes later.
  - Free: up to 10 units, statement matching, SMS receipts, manual reminders.
  - Growth: live matching, automatic reminders, one caretaker per building, water billing, late fees, deposits.
  - Pro: multiple buildings, unlimited caretakers, WhatsApp, owner statements, tax summary, expenses.

  Automatic matching is never gated.

## Deploying

1. **Supabase**:
   - `npx supabase link --project-ref <ref>`, then `npx supabase db push` (or `db reset --remote` for a fresh project).
   - Enable the Google provider and set the Site URL and redirect URLs (`https://<app>/auth/callback`).
2. **Vercel**: set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL`.
3. **Make yourself staff:** `insert into platform_admins (user_id) select id from auth.users where email = '<you>';`. You can then switch an org's plan from Settings.
