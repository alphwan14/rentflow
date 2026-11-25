-- RentFlow v2 — money: charges, payment events, payments, the append-only
-- ledger, learned match rules, the message outbox, the job queue and the audit log.

create type public.charge_kind as enum ('rent', 'water', 'garbage', 'service', 'late_fee', 'deposit', 'arrears_bf', 'other');
create type public.entry_kind as enum ('charge', 'payment', 'adjustment', 'reversal');
create type public.payment_source as enum ('mpesa_statement', 'daraja_c2b', 'kcb_buni', 'cash', 'manual');
create type public.event_status as enum ('pending', 'matched', 'suggested', 'unmatched', 'ignored');
create type public.rule_kind as enum ('phone', 'name', 'account_ref');
create type public.message_channel as enum ('sms', 'whatsapp');
create type public.message_kind as enum ('receipt', 'reminder', 'notice', 'other');
create type public.message_status as enum ('queued', 'sending', 'sent', 'delivered', 'failed');

-- ── Charges: what a tenant owes. The amount is fixed when created. ──────────
create table public.charges (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  lease_id     uuid not null,
  kind         public.charge_kind not null,
  period       date check (period is null or period = date_trunc('month', period)::date),
  due_date     date not null,
  amount_cents bigint not null check (amount_cents > 0),
  description  text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (lease_id, org_id) references public.leases (id, org_id)
);
-- Recurring charges exist once per lease per month, so charge runs are idempotent.
create unique index charges_recurring_uniq on public.charges (lease_id, kind, period)
  where kind in ('rent', 'garbage', 'service', 'late_fee');
create index charges_lease_idx on public.charges (lease_id);

-- ── Statement uploads ──────────────────────────────────────────────────────
create table public.statement_uploads (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  building_id      uuid,
  filename         text not null,
  format           text not null,
  period_start     date,
  period_end       date,
  total_payments   int not null default 0,
  new_events       int not null default 0,
  duplicate_events int not null default 0,
  skipped_lines    int not null default 0,
  auto_matched     int not null default 0,
  suggested        int not null default 0,
  unmatched        int not null default 0,
  uploaded_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (building_id, org_id) references public.buildings (id, org_id) on delete set null (building_id)
);

-- ── Payment events: every raw notification / statement line, stored once. ──
create table public.payment_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  source              public.payment_source not null,
  trans_code          text not null check (trans_code ~ '^[A-Z0-9-]{4,40}$'),
  amount_cents        bigint not null check (amount_cents > 0),
  occurred_at         timestamptz not null,
  payer_phone         text check (payer_phone is null or payer_phone ~ '^254[17][0-9]{8}$'),
  payer_phone_masked  text,
  payer_name          text,
  account_ref         text,
  building_id         uuid,
  channel_id          uuid references public.payout_channels (id) on delete set null,
  upload_id           uuid references public.statement_uploads (id) on delete set null,
  raw                 jsonb not null default '{}',
  status              public.event_status not null default 'pending',
  confidence          numeric(3, 2),
  -- The engine's MatchOutcome: best guess, candidates, reasons, summary.
  suggestion          jsonb,
  suggested_lease_ids uuid[],
  processed_at        timestamptz,
  resolved_by         uuid references auth.users (id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (id, org_id),
  -- An M-Pesa receipt is one payment, whichever way we hear about it.
  unique (org_id, trans_code),
  foreign key (building_id, org_id) references public.buildings (id, org_id) on delete set null (building_id)
);
create index payment_events_status_idx on public.payment_events (org_id, status, occurred_at desc);

-- ── Payments: a matched payment, linked to its event. ─────────────────────
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  event_id      uuid not null,
  amount_cents  bigint not null check (amount_cents > 0),
  paid_at       timestamptz not null,
  method        public.payment_source not null,
  reference     text not null,
  -- Main lease (first allocation); the split is in ledger_entries.
  lease_id      uuid not null,
  match_method  text not null check (match_method in ('auto', 'confirmed', 'manual')),
  confidence    numeric(3, 2),
  status        text not null default 'posted' check (status in ('posted', 'reversed')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  reversed_at   timestamptz,
  reversed_by   uuid references auth.users (id) on delete set null,
  reversal_note text,
  unique (id, org_id),
  foreign key (event_id, org_id) references public.payment_events (id, org_id),
  foreign key (lease_id, org_id) references public.leases (id, org_id)
);
create index payments_org_paid_idx on public.payments (org_id, paid_at desc);
-- One live payment per event. A reversed payment frees its event to be posted again.
create unique index payments_event_posted_uniq on public.payments (event_id) where status = 'posted';

-- ── Ledger: append-only. Balances are always summed from here. ────────────
create table public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,
  org_id         uuid not null,
  lease_id       uuid not null,
  kind           public.entry_kind not null,
  -- > 0 increases what the tenant owes, < 0 reduces it.
  amount_cents   bigint not null check (amount_cents <> 0),
  effective_date date not null,
  charge_id      uuid unique references public.charges (id),
  payment_id     uuid references public.payments (id),
  reverses_id    uuid unique references public.ledger_entries (id),
  memo           text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (lease_id, org_id) references public.leases (id, org_id),
  check (kind <> 'charge' or (charge_id is not null and amount_cents > 0)),
  check (kind <> 'payment' or (payment_id is not null and amount_cents < 0)),
  check (kind <> 'reversal' or reverses_id is not null),
  check (kind = 'reversal' or reverses_id is null)
);
create index ledger_lease_idx on public.ledger_entries (lease_id, effective_date, seq);
create index ledger_org_date_idx on public.ledger_entries (org_id, effective_date);
create index ledger_payment_idx on public.ledger_entries (payment_id) where payment_id is not null;

-- History is never edited. Corrections are reversal entries.
-- (A platform purge can set rentflow.allow_purge = 'on' inside its transaction.)
create function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('rentflow.allow_purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception '% is append-only: post a reversal instead', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger ledger_append_only before update or delete on public.ledger_entries
  for each row execute function public.forbid_mutation();
create trigger charges_immutable before update or delete on public.charges
  for each row execute function public.forbid_mutation();

-- Payments: only the reversal fields may change, once.
create function public.guard_payment_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('rentflow.allow_purge', true), '') = 'on' then return old; end if;
    raise exception 'payments cannot be deleted: reverse them instead' using errcode = 'P0001';
  end if;
  if old.status = 'reversed'
     or new.amount_cents <> old.amount_cents or new.event_id <> old.event_id
     or new.lease_id <> old.lease_id or new.paid_at <> old.paid_at or new.org_id <> old.org_id then
    raise exception 'payments are immutable except for reversal' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function public.guard_payment_update();

-- ── Learned matching rules ─────────────────────────────────────────────────
create table public.match_rules (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  kind       public.rule_kind not null,
  pattern    text not null check (length(pattern) between 3 and 120),
  tenant_id  uuid not null,
  hits       int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, kind, pattern, tenant_id),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id) on delete cascade
);

-- ── Outbox: SMS / WhatsApp (sent by the worker, phase 4) ──────────────────
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  channel             public.message_channel not null default 'sms',
  kind                public.message_kind not null,
  to_phone            text not null check (to_phone ~ '^254[17][0-9]{8}$'),
  body                text not null check (length(body) between 1 and 1600),
  tenant_id           uuid,
  payment_id          uuid references public.payments (id) on delete set null,
  status              public.message_status not null default 'queued',
  provider            text,
  provider_message_id text,
  error               text,
  attempts            int not null default 0,
  send_after          timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id) on delete set null (tenant_id)
);
create index messages_queue_idx on public.messages (send_after) where status = 'queued';

-- ── Job queue (Postgres, consumed by the Render worker with SKIP LOCKED) ───
create table public.jobs (
  id           bigint generated always as identity primary key,
  kind         text not null,
  org_id       uuid references public.orgs (id) on delete cascade,
  payload      jsonb not null default '{}',
  run_at       timestamptz not null default now(),
  attempts     int not null default 0,
  max_attempts int not null default 8,
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (run_at) where done_at is null;

-- ── Audit log: who did what, when ─────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index audit_org_idx on public.audit_log (org_id, created_at desc);
