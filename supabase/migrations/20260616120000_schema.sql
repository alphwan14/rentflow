-- =============================================================================
-- RentFlow schema — immutable financial events, derived balances.
-- Money is ALWAYS stored as integer minor units (cents) in BIGINT columns.
-- =============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Identity & scope
-- ---------------------------------------------------------------------------

-- One landlord account. The MVP is single-landlord, but every row carries an
-- org_id so multi-landlord is a future config change, not a migration.
create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Extends auth.users with role + org membership. This is the audit identity.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid not null references orgs (id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin', 'staff')),
  created_at  timestamptz not null default now()
);
create index profiles_org_idx on profiles (org_id);

-- ---------------------------------------------------------------------------
-- Property & people
-- ---------------------------------------------------------------------------

create table rental_units (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs (id) on delete cascade,
  label              text not null,
  default_rent_cents bigint not null default 0 check (default_rent_cents >= 0),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, label)
);
create index rental_units_org_idx on rental_units (org_id);

create table tenants (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs (id) on delete cascade,
  unit_id            uuid references rental_units (id) on delete set null,
  full_name          text not null,
  phone              text,
  monthly_rent_cents bigint not null check (monthly_rent_cents > 0),
  due_day            int not null default 1 check (due_day between 1 and 31),
  move_in_date       date not null,
  notes              text,
  status             text not null default 'active'
                       check (status in ('active', 'inactive', 'vacating')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tenants_org_idx on tenants (org_id);
create index tenants_unit_idx on tenants (unit_id);

-- ---------------------------------------------------------------------------
-- Immutable financial events
-- ---------------------------------------------------------------------------

-- A monthly rent obligation. The amount is SNAPSHOTTED here at generation time
-- so raising a tenant's rent never rewrites history. One charge per month.
create table rent_charges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  period_month  date not null check (period_month = date_trunc('month', period_month)::date),
  amount_cents  bigint not null check (amount_cents > 0),
  due_date      date not null,
  created_at    timestamptz not null default now(),
  unique (tenant_id, period_month)
);
create index rent_charges_tenant_idx on rent_charges (tenant_id, period_month);

-- A payment received. Immutable. Corrections happen via reversal adjustments.
create table payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  method        text not null default 'cash'
                  check (method in ('cash', 'mpesa', 'bank', 'other')),
  note          text,
  paid_at       timestamptz not null default now(),
  recorded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index payments_tenant_idx on payments (tenant_id, paid_at);

-- Non-rent corrections: waivers (credit), extra fees (debit), reversals.
create table adjustments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  type          text not null check (type in ('credit', 'debit')),
  amount_cents  bigint not null check (amount_cents > 0),
  reason        text not null,
  recorded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index adjustments_tenant_idx on adjustments (tenant_id);

-- THE SOURCE OF FINANCIAL TRUTH. Append-only. Every charge/payment/adjustment
-- writes exactly one signed entry here, in the same transaction. The balance is
-- never stored — it is SUM(amount_cents) over this table.
--   charge      -> positive (tenant owes)
--   payment     -> negative (tenant paid)
--   adjustment  -> credit negative / debit positive
--   reversal    -> opposite sign of what it reverses
create table ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  entry_type    text not null check (entry_type in ('charge', 'payment', 'adjustment', 'reversal')),
  amount_cents  bigint not null check (amount_cents <> 0),
  source_table  text not null,
  source_id     uuid not null,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint ledger_charge_positive check (entry_type <> 'charge' or amount_cents > 0),
  constraint ledger_payment_negative check (entry_type <> 'payment' or amount_cents < 0)
);
create index ledger_tenant_idx on ledger_entries (tenant_id, occurred_at);

-- Materialized FIFO result (which payment cleared which charge). Always
-- recomputable from charges+payments; stored for receipts/statements/disputes.
-- charge_id NULL = the slice that became forward credit (advance).
create table payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs (id) on delete cascade,
  tenant_id     uuid not null references tenants (id) on delete cascade,
  payment_id    uuid not null references payments (id) on delete cascade,
  charge_id     uuid references rent_charges (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  created_at    timestamptz not null default now()
);
create index payment_allocations_tenant_idx on payment_allocations (tenant_id);
create index payment_allocations_payment_idx on payment_allocations (payment_id);

-- ---------------------------------------------------------------------------
-- Receipts & SMS
-- ---------------------------------------------------------------------------

-- Per-(org, year) atomic counter for professional receipt numbers.
create table receipt_counters (
  org_id    uuid not null references orgs (id) on delete cascade,
  year      int not null,
  last_seq  bigint not null default 0,
  primary key (org_id, year)
);

-- A receipt is a FROZEN point-in-time snapshot. Even if later events change the
-- live balance, the receipt the tenant holds never changes.
create table receipts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  payment_id  uuid not null unique references payments (id) on delete cascade,
  receipt_no  text not null unique,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now()
);

-- Outbox: recording a payment enqueues a PENDING SMS. A worker sends it later
-- and flips status — a flaky gateway must never block a recorded payment.
create table sms_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  tenant_id   uuid not null references tenants (id) on delete cascade,
  payment_id  uuid references payments (id) on delete set null,
  to_phone    text not null,
  body        text not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider    text,
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index sms_messages_status_idx on sms_messages (status);
