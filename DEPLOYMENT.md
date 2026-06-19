# RentFlow — Production Deployment

- **Frontend** (Next.js) → **Vercel**
- **Backend** (NestJS system engine: SMS worker + delivery webhook) → **Render**
- **Database/Auth** → **Supabase** (cloud)
- **SMS** → **Africa's Talking** (production)

The frontend talks to Supabase directly. The backend shares only the database
(it drains the `sms_messages` outbox and receives AT delivery reports). They are
deployed independently.

---

## 1. Supabase (do this first)

Apply migrations **in order** via the SQL editor (or `supabase db push` if you
have the DB password). Run each file's contents once, oldest → newest:

```
supabase/migrations/20260616120000_schema.sql
supabase/migrations/20260616120100_functions.sql
supabase/migrations/20260616120200_onboarding.sql
supabase/migrations/20260616120300_rls.sql
supabase/migrations/20260616120400_views.sql
supabase/migrations/20260616120500_sms_worker.sql
supabase/migrations/20260620090000_production_delivery.sql
```

Notes:
- Migrations are plain SQL — no local-CLI-only steps. The SQL editor works.
- They're written to be safe to apply in order (`create or replace`,
  `add column if not exists`, `drop constraint if exists`). The initial
  `create table` files are run once.
- Enable **Email/Password** auth (Authentication → Providers).

---

## 2. Backend → Render

**Option A — Blueprint:** commit `render.yaml`, then Render → New → Blueprint.

**Option B — Manual web service:**
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`   (→ `node dist/main.js`)
- **Health Check Path:** `/health`
- **Node version:** 22 (`NODE_VERSION=22`)

### Render environment variables
| Key | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (secret) |
| `SMS_PROVIDER` | `africastalking` |
| `AT_USERNAME` | your **production** AT app username (not `sandbox`) |
| `AT_API_KEY` | production AT API key (secret) |
| `AT_FROM` | registered sender id, or blank for account default |
| `CORS_ORIGINS` | your Vercel prod URL, e.g. `https://rentflow.vercel.app` |
| `WORKER_ADMIN_TOKEN` | strong random token (protects `POST /sms/process`) |
| `DELIVERY_REPORT_TOKEN` | strong random token (protects the webhook) |
| `SMS_WORKER_INTERVAL_MS` | `10000` |

> ⚠️ **Free tier caveat:** Render **free** web services spin down when idle, which
> stops the SMS worker. Use **Starter** (always-on) for reliable delivery, or keep
> a free instance warm with an external uptime pinger hitting `/health`.

### After deploy
- `GET https://<backend>.onrender.com/health` → `{"status":"ok","service":"rentflow-backend",...}`
- In the **Africa's Talking dashboard**, set the SMS **Delivery Report callback URL** to:
  `https://<backend>.onrender.com/sms/delivery-report?token=<DELIVERY_REPORT_TOKEN>`

---

## 3. Frontend → Vercel

- **Framework preset:** Next.js (root of repo).
- **Build:** default (`next build`). No config needed.

### Vercel environment variables
| Key | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | anon key (public, RLS-protected) |
| `NEXT_PUBLIC_API_URL` | All | `https://<backend>.onrender.com` |

After the backend URL is known, add it to the backend's `CORS_ORIGINS` (your
Vercel domain) and redeploy the backend.

---

## 4. Deployment checklist

- [ ] All 7 migrations applied to Supabase (in order)
- [ ] Email/Password auth enabled
- [ ] Backend deployed on Render (root `backend`, build+start set)
- [ ] All Render env vars set; `AT_USERNAME` is the real prod username
- [ ] `/health` returns ok
- [ ] AT delivery-report callback URL configured (with token)
- [ ] Frontend deployed on Vercel with the 3 `NEXT_PUBLIC_*` vars
- [ ] `CORS_ORIGINS` includes the Vercel prod domain; backend redeployed
- [ ] AT wallet funded; sender id registered (or `AT_FROM` blank)
- [ ] Secrets only in dashboards/`.env` (gitignored) — never committed

---

## 5. End-to-end QA flow

Run against the deployed environment with a real Kenyan handset you control.

| # | Step | Expected |
|---|---|---|
| 1 | Create a tenant (phone e.g. `0756528219`) | Saved; phone stored as `+254756528219` |
| 2 | Record a payment | Receipt page shows receipt no. + Covered Until |
| 3 | Verify ledger allocation | Tenant ledger shows charge(s) cleared oldest-first; balance correct |
| 4 | Verify SMS queue | `select status,to_phone,provider_message_id from sms_messages order by created_at desc limit 1;` → `pending`, E.164 phone |
| 5 | Trigger worker | wait one interval, or `POST /sms/process` with `Authorization: Bearer <WORKER_ADMIN_TOKEN>` → `{processed:1,sent:1,...}` |
| 6 | Confirm SMS delivery | Row → `sent` + `provider_message_id`; **SMS arrives on the handset** |
| 7 | Confirm delivery webhook | AT calls `/sms/delivery-report`; row → `delivered`, `delivered_at` set |
| 8 | Verify frontend reflects status | Tenant profile shows updated balance/receipt; dashboard status correct |

Manual worker trigger:
```bash
curl -X POST https://<backend>.onrender.com/sms/process \
  -H "Authorization: Bearer <WORKER_ADMIN_TOKEN>"
```
