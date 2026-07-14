# RentFlow v1.1 — Production Deployment Checklist

Multi-user organizations, Google sign-in, invitations, roles, mobile-first UI.
All database changes are **additive**; the payment/ledger/receipt/SMS pipeline
is untouched. The Render SMS worker needs **no changes and no redeploy**.

## 1. Google Cloud (one-time)

1. Create/reuse a Google Cloud project → **APIs & Services → OAuth consent screen**:
   external, app name "RentFlow", add your domain.
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     (find `<project-ref>` in the Supabase dashboard URL).
3. Note the **Client ID** and **Client secret**.

## 2. Supabase dashboard

1. **Authentication → Providers → Google**: enable, paste client ID/secret. ✔ done
2. **Authentication → URL Configuration**: ✔ done
   - Site URL: `https://rentflow-kadz.vercel.app`
   - Redirect URLs (allowlist):
     - `https://rentflow-kadz.vercel.app/auth/callback`
     - `https://rentflow-kadz.vercel.app/auth/confirm`
3. **Authentication → Email**: "Confirm email" should be ON (it is the default
   on hosted projects — verify).
4. **Email templates — NO customization required (Free plan OK).** The app
   handles Supabase's DEFAULT templates: the email link verifies at GoTrue and
   redirects back with a `?code=` that `/auth/callback` exchanges. Two Free-plan
   caveats to know:
   - Email links complete sign-in only in the **same browser** that started the
     flow (PKCE). Opened elsewhere, the email is still verified and the user is
     shown "sign in below" — nothing breaks, it's just an extra step.
   - The built-in mailer is rate-limited (~a few emails/hour) and sends from
     `noreply@mail.app.supabase.io`. Fine for launch volume; move to custom
     SMTP later for scale.
   If you later customize templates (any plan) or add SMTP, the
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...` pattern is
   also supported and removes the same-browser limitation.

## 3. Database migrations

```bash
supabase db push
```

Applies (in order):
- `20260714090000_roles_and_security.sql` — role set (owner/admin/staff/caretaker/viewer),
  owner promotion, `rf_is_owner/rf_is_admin/rf_can_write`, policy recreation,
  security fixes (profiles column-level UPDATE grant, `tenant_financials` org
  check, `soft_delete_tenant` role check), `record_payment_checked` wrapper.
- `20260714090100_org_invites.sql` — `org_invites` table + invite/team RPCs +
  `orgs_update` policy.

**Do NOT apply `supabase/hardening/revoke_record_payment_direct.sql` yet** —
see step 6.

## 4. Vercel

Environment variables (Production):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — unchanged
- `NEXT_PUBLIC_SITE_URL=https://<your-prod-domain>` — **new, required**
  (auth redirects and invite links are built from it)
- `RESEND_API_KEY` — optional; enables automatic invite emails
- `INVITE_EMAIL_FROM` — optional, e.g. `RentFlow <invites@yourdomain.com>`

Deploy. (Frontend before/after `db push` both work — the app tolerates both
`admin` and `owner` roles and keeps calling `record_payment_checked` only after
the migration exists; deploy them within the same maintenance window.)

## 5. Post-deploy smoke test (in order)

1. **Regression first**: sign in as the existing owner → record a real payment →
   receipt number continues the `RCP-YYYY-xxxxx` sequence → SMS row appears and
   is delivered by the Render worker → statement prints correctly.
2. Existing account shows role **Owner** in Settings; can still add/edit tenants.
3. **Google sign-in** with a fresh account → lands on onboarding.
4. **Invite round-trip**: Settings → create invite (Caretaker) → open link in an
   incognito window → Continue with Google → Join → sees the org's dashboard.
5. **Role enforcement**: demote the new member to Viewer → their Record-payment
   form disappears and the RPC refuses.
6. **Forgot password** end-to-end.
7. Phone check at 375 px: bottom nav, ledger cards, numeric keypad on amount,
   tel keypad on phone, statement print preview unchanged.

## 6. Hardening step (after step 5 passes)

Copy `supabase/hardening/revoke_record_payment_direct.sql` into
`supabase/migrations/` with a fresh timestamp and `supabase db push`. This
revokes direct `record_payment` execution from clients, leaving only the
role-checked `record_payment_checked` path. Deferred so an older deployed
frontend can never hit a broken-payments window.

## 7. Render (SMS worker)

Nothing. No schema the worker touches changed; `claim_sms_batch` /
`reap_stuck_sms` untouched. Do not redeploy.

## 8. Rollback plan

- **App**: redeploy the previous Vercel build — it keeps working against the
  migrated database (old policies' semantics are preserved via `rf_is_admin`,
  and the direct `record_payment` grant remains until step 6).
- **Database**: migrations are additive. If ever needed:
  - role promotion: `update profiles set role='admin' where role='owner';`
  - profiles grant: `grant update on table profiles to authenticated;`
  - invites: `drop table org_invites cascade;` (only if never used)
- **Google login off-switch**: disable the provider in Supabase; the button
  fails gracefully with a visible error while email/password keeps working.

## 9. Monitoring

- Vercel function logs: existing `sms.enqueue.*` JSON events still fire
  (recordPayment path unchanged apart from the wrapper RPC).
- Supabase → Logs → Postgres: watch for `not authorized` spikes (would indicate
  a mis-scoped client) and failed `accept_invite` attempts.
- Auth → Users: confirm no duplicate-account creation from Google sign-ins
  (returning users must map to the same `auth.uid`).
