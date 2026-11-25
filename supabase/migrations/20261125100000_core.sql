-- RentFlow v2 — core structure: orgs → buildings → units → leases.
-- Money columns are bigint cents. Child rows carry org_id and use composite
-- foreign keys so a row can never point at another organisation's data.

create type public.member_role as enum ('owner', 'manager', 'caretaker', 'viewer');
create type public.org_plan as enum ('free', 'growth', 'pro');
create type public.unit_status as enum ('occupied', 'vacant', 'ready');
create type public.payout_kind as enum ('paybill', 'till', 'bank');
create type public.lease_status as enum ('active', 'ended');

-- ── People ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now()
);

create table public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 120),
  plan       public.org_plan not null default 'free',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.members (
  org_id       uuid not null references public.orgs (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.member_role not null,
  -- Caretakers can be limited to some buildings (null = all). Used from phase 6.
  building_ids uuid[],
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  role        public.member_role not null check (role <> 'owner'),
  token_hash  text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- RentFlow staff and field agents (internal admin, later phases).
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Property ──────────────────────────────────────────────────────────────
create table public.buildings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  name                text not null check (length(btrim(name)) between 1 and 120),
  location            text,
  default_due_day     smallint not null default 5 check (default_due_day between 1 and 28),
  -- First month RentFlow keeps the books for (older debt comes in as "balance brought forward").
  tracking_from       date not null default date_trunc('month', now())::date
                      check (tracking_from = date_trunc('month', tracking_from)::date),
  late_fee_enabled    boolean not null default false,
  late_fee_kind       text not null default 'flat' check (late_fee_kind in ('flat', 'percent')),
  -- cents when flat, basis points of rent when percent (1000 = 10%)
  late_fee_value      bigint not null default 0 check (late_fee_value >= 0),
  late_fee_grace_days smallint not null default 5 check (late_fee_grace_days between 0 and 28),
  created_at          timestamptz not null default now(),
  archived_at         timestamptz,
  unique (id, org_id)
);
create unique index buildings_name_uniq on public.buildings (org_id, lower(name)) where archived_at is null;

-- Where tenants pay: always the landlord's own paybill / till / bank account.
create table public.payout_channels (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  building_id    uuid,                         -- null = every building in the org
  kind           public.payout_kind not null,
  number         text not null check (number ~ '^[0-9A-Za-z-]{3,30}$'),
  bank_name      text,
  -- Shown to tenants: what to type as the account ("Your unit code, e.g. B12").
  account_hint   text not null default 'Your unit code, e.g. B12',
  live_enabled   boolean not null default false,  -- Daraja / Buni connected (phase 4)
  created_at     timestamptz not null default now(),
  foreign key (building_id, org_id) references public.buildings (id, org_id) on delete cascade
);
create unique index payout_channels_uniq on public.payout_channels (org_id, kind, number);

create table public.units (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  building_id   uuid not null,
  code          text not null check (length(btrim(code)) between 1 and 20),
  -- Canonical code for matching: "b-012" → "B12" (same rule as canonCode() in TS).
  code_key      text generated always as (
                  regexp_replace(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), '(^|[^0-9])0+([0-9])', '\1\2', 'g')
                ) stored,
  rent_cents    bigint not null default 0 check (rent_cents >= 0),
  deposit_cents bigint not null default 0 check (deposit_cents >= 0),
  status        public.unit_status not null default 'vacant',
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (id, org_id),
  foreign key (building_id, org_id) references public.buildings (id, org_id) on delete cascade
);
create unique index units_code_uniq on public.units (building_id, code_key) where archived_at is null;
create index units_org_idx on public.units (org_id);

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  id_number   text,
  notes       text,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
create index tenants_org_idx on public.tenants (org_id);

create table public.tenant_phones (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  tenant_id  uuid not null,
  phone      text not null check (phone ~ '^254[17][0-9]{8}$'),
  label      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id) on delete cascade
);
create index tenant_phones_lookup on public.tenant_phones (org_id, phone);

create table public.leases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  unit_id       uuid not null,
  tenant_id     uuid not null,
  start_date    date not null,
  end_date      date check (end_date is null or end_date >= start_date),
  rent_cents    bigint not null check (rent_cents > 0),
  deposit_cents bigint not null default 0 check (deposit_cents >= 0),
  due_day       smallint not null default 5 check (due_day between 1 and 28),
  status        public.lease_status not null default 'active',
  created_at    timestamptz not null default now(),
  ended_at      timestamptz,
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units (id, org_id),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id)
);
create unique index leases_one_active_per_unit on public.leases (unit_id) where status = 'active';
create index leases_org_idx on public.leases (org_id, status);
create index leases_tenant_idx on public.leases (tenant_id);
