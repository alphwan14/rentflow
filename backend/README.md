# RentFlow Backend — System Engine

The operational layer for RentFlow: SMS orchestration and background workers.
NestJS + TypeScript, talking to the same Supabase Postgres as the frontend.

## What it does (now)

- **SMS worker** — drains the `sms_messages` outbox reliably:
  - atomic claim (`claim_sms_batch`, `FOR UPDATE SKIP LOCKED`) so no message is
    sent twice by concurrent workers,
  - send via a pluggable **SmsProvider** (Africa's Talking, or a console provider
    for local dev),
  - bounded exponential backoff retries (1m → 5m → 15m → 1h → 3h → 12h),
  - statuses: `pending → sending → sent | retrying → … | failed`,
  - crash recovery via a reaper (`reap_stuck_sms`) that re-queues stranded rows.
- **Receipt formatter** — pure, GSM-7-aware SMS rendering, separated from business
  logic so a future ESC/POS (thermal printer) formatter can reuse the snapshot.
- **Health endpoint** — `GET /health`.
- **Manual trigger** — `POST /sms/process` runs one processing cycle on demand.
  When `WORKER_ADMIN_TOKEN` is set, authenticate with either
  `Authorization: Bearer <token>` or `X-Worker-Token: <token>`.
- **Delivery reports** — `POST /sms/delivery-report` receives Africa's Talking
  delivery callbacks (form-encoded `id`, `status`, `phoneNumber`, …) and updates
  the row to its real state. Optionally protect with `DELIVERY_REPORT_TOKEN`
  (`?token=…` in the callback URL).

## SMS status lifecycle

```
pending → sending → sent ──(delivery report)──► delivered
   │         │        │                          └► failed
   └─ retrying ◄──────┘ (transient between retries)
```
- `sent` = **accepted by the AT API** (statusCode 101). NOT proof of handset delivery.
- `delivered` / `failed` = **real handset outcome**, set by the delivery-report webhook.

## Production mode

The SMS provider defaults to **Africa's Talking (production endpoint only)** —
there is no sandbox code path and no silent fallback. Misconfiguration fails fast
at boot. For local dev that must not send real SMS, set `SMS_PROVIDER=console`
explicitly.

Required production env: `AT_USERNAME` must be your **real AT application
username** (not `sandbox`), `AT_API_KEY` a production key, and `AT_FROM` either
blank (account default sender) or a **registered** sender id.

## Integrity guarantees

The worker authenticates with the Supabase **service role** (bypasses RLS) and
**only ever touches `sms_messages`** — never `ledger_entries`, `payments`, or
balances. A failed/slow SMS can never affect a recorded payment, because the
payment already committed atomically before the outbox row existed.

> Known trade-off: if the worker crashes *after* the provider accepted a message
> but *before* recording `sent`, the reaper re-sends it once (Africa's Talking has
> no client idempotency key). A duplicate receipt is harmless; financial state is
> never affected.

## Setup

1. **Apply the migration** that adds the queue functions/columns (run from the
   repo root, not here):
   ```bash
   supabase db push          # or paste supabase/migrations/20260616120500_sms_worker.sql into the SQL editor
   ```
2. `cp .env.example .env` and fill in `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
   Leave `SMS_PROVIDER=console` for local testing.
3. Install & run:
   ```bash
   npm install
   npm run start:dev     # watch mode
   # or
   npm run build && npm start
   ```

To send for real, set `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY`
(and `AT_FROM` for a sender id). Use `AT_SANDBOX=true` while testing.

## Scripts

```bash
npm run start:dev    # dev (watch)
npm run build        # tsc -> dist/
npm start            # run compiled
npm run typecheck    # tsc --noEmit
npm test             # vitest (retry + receipt formatter)
```

## Structure

```
src/config/        Typed env config (fails fast on missing Supabase creds)
src/supabase/      Service-role client
src/sms/           Worker, repository, providers, retry, types, controller
src/receipts/      Pure GSM-7 receipt formatter
src/health/        Health controller
```

## Next (future phases)

Receipt orchestration endpoints, delivery-report webhooks (AT), M-Pesa STK push,
thermal printing (ESC/POS), and migrating payment orchestration here behind the
existing `record_payment` RPC.
