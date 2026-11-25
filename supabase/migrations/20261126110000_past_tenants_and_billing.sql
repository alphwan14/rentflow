-- RentFlow v2 — (1) money owed by tenants who have moved out can still be
-- collected, and (2) manual subscription tracking for the staff admin until
-- real billing arrives (phase 7).

-- ── 1. Cash from past tenants ─────────────────────────────────────────────
-- A moved-out tenant who still owes can pay it off; the payment goes to their
-- old tenancy. (Previously only current tenants could be paid.)
create or replace function public.record_cash_payment(p_lease uuid, p_amount bigint, p_paid_on date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  l public.leases;
  v_event uuid;
  v_code text := 'CASH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  select * into l from public.leases where id = p_lease;
  if not found or not public.can_operate(l.org_id) then perform public._deny(); end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter how much was paid.' using errcode = 'P0001'; end if;
  if p_paid_on is null or p_paid_on > public.nairobi_today() then
    raise exception 'The payment date can''t be in the future.' using errcode = 'P0001';
  end if;
  insert into public.payment_events (org_id, source, trans_code, amount_cents, occurred_at, payer_name, account_ref, building_id, raw, status)
  select l.org_id, 'cash', v_code, p_amount, (p_paid_on::text || ' 12:00+03')::timestamptz, nullif(btrim(p_note), ''), u.code, u.building_id,
         jsonb_build_object('recorded_by', auth.uid()), 'pending'
    from public.units u where u.id = l.unit_id
  returning id into v_event;
  return public._post_payment(v_event, jsonb_build_array(jsonb_build_object('lease_id', l.id, 'amount_cents', p_amount)), 'manual', null, auth.uid());
end $$;

-- ── 2. Subscriptions (manual until billing is built) ──────────────────────
create type public.subscription_status as enum ('trial', 'active', 'cancelled');

-- Price per unit per month for each paid plan, set by staff.
create table public.plan_prices (
  plan                 public.org_plan primary key,
  price_per_unit_cents bigint not null default 0 check (price_per_unit_cents >= 0),
  updated_at           timestamptz not null default now()
);
insert into public.plan_prices (plan, price_per_unit_cents) values ('free', 0), ('growth', 0), ('pro', 0);

create table public.subscriptions (
  org_id               uuid primary key references public.orgs (id) on delete cascade,
  status               public.subscription_status not null default 'trial',
  trial_ends           date,
  paid_until           date,
  -- Optional special price for this landlord (null = the plan's price).
  price_override_cents bigint check (price_override_cents is null or price_override_cents >= 0),
  notes                text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);

create table public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  amount_cents     bigint not null check (amount_cents > 0),
  paid_on          date not null,
  months           int not null check (months between 1 and 24),
  method           text not null check (method in ('mpesa', 'bank', 'cash', 'other')),
  reference        text,
  note             text,
  paid_until_after date not null,
  recorded_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index subscription_payments_org_idx on public.subscription_payments (org_id, paid_on desc);

-- Every new account starts with a 30-day trial.
create function public.start_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (org_id, status, trial_ends)
  values (new.id, 'trial', public.nairobi_today() + 30)
  on conflict (org_id) do nothing;
  return new;
end $$;
create trigger orgs_start_subscription after insert on public.orgs
  for each row execute function public.start_subscription();

insert into public.subscriptions (org_id, status, trial_ends)
select id, 'trial', public.nairobi_today() + 30 from public.orgs
on conflict (org_id) do nothing;

alter table public.plan_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
revoke all on public.plan_prices, public.subscriptions, public.subscription_payments from anon, authenticated;
grant select on public.subscriptions, public.subscription_payments to authenticated;
-- Owners can see their own subscription; staff see everything through the admin functions.
create policy subscriptions_read on public.subscriptions for select to authenticated using (public.is_owner(org_id) or public.is_platform_admin());
create policy subscription_payments_read on public.subscription_payments for select to authenticated using (public.is_owner(org_id) or public.is_platform_admin());

-- What the admin shows: Free, Trial, Paid, Overdue or Cancelled.
create function public.billing_status(p_plan public.org_plan, s public.subscriptions) returns text
language sql stable set search_path = '' as $$
  select case
    when p_plan = 'free' then 'free'
    when s.status = 'cancelled' then 'cancelled'
    when s.paid_until is not null and s.paid_until >= public.nairobi_today() then 'paid'
    when s.paid_until is null and s.trial_ends is not null and s.trial_ends >= public.nairobi_today() then 'trial'
    else 'overdue'
  end
$$;

create function public.admin_billing()
returns table (
  org_id uuid, name text, owner_name text, owner_email text, plan public.org_plan, billing text,
  units int, price_per_unit_cents bigint, monthly_cents bigint,
  trial_ends date, paid_until date, last_paid_on date, last_paid_cents bigint, total_paid_cents bigint, notes text,
  price_override_cents bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select o.id, o.name,
         (select p.full_name from public.members m join public.profiles p on p.user_id = m.user_id where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1),
         (select p.email from public.members m join public.profiles p on p.user_id = m.user_id where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1),
         o.plan, public.billing_status(o.plan, s),
         u.n,
         coalesce(s.price_override_cents, pp.price_per_unit_cents, 0),
         case when o.plan = 'free' then 0 else u.n * coalesce(s.price_override_cents, pp.price_per_unit_cents, 0) end,
         s.trial_ends, s.paid_until,
         (select max(sp.paid_on) from public.subscription_payments sp where sp.org_id = o.id),
         (select sp.amount_cents from public.subscription_payments sp where sp.org_id = o.id order by sp.paid_on desc, sp.created_at desc limit 1),
         (select coalesce(sum(sp.amount_cents), 0)::bigint from public.subscription_payments sp where sp.org_id = o.id),
         s.notes,
         s.price_override_cents
    from public.orgs o
    left join public.subscriptions s on s.org_id = o.id
    left join public.plan_prices pp on pp.plan = o.plan
    cross join lateral (select count(*)::int as n from public.units x where x.org_id = o.id and x.archived_at is null) u
   order by o.name;
end $$;

create function public.admin_subscription_payments(p_org uuid)
returns setof public.subscription_payments
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query select * from public.subscription_payments where org_id = p_org order by paid_on desc, created_at desc;
end $$;

create function public.admin_plan_prices()
returns setof public.plan_prices
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query select * from public.plan_prices order by plan;
end $$;

create function public.admin_set_plan_price(p_plan public.org_plan, p_price_cents bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  if p_price_cents is null or p_price_cents < 0 then raise exception 'Enter a price of zero or more.' using errcode = 'P0001'; end if;
  update public.plan_prices set price_per_unit_cents = p_price_cents, updated_at = now() where plan = p_plan;
end $$;

-- Record that a landlord paid RentFlow; moves "paid up to" forward by p_months.
create function public.admin_record_subscription_payment(
  p_org uuid, p_amount_cents bigint, p_paid_on date, p_months int, p_method text, p_reference text default null, p_note text default null
) returns date
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions;
  v_from date;
  v_until date;
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter how much they paid.' using errcode = 'P0001'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Choose how many months it covers (1 to 24).' using errcode = 'P0001'; end if;
  if p_paid_on is null or p_paid_on > public.nairobi_today() then raise exception 'The payment date can''t be in the future.' using errcode = 'P0001'; end if;
  insert into public.subscriptions (org_id) values (p_org) on conflict (org_id) do nothing;
  select * into s from public.subscriptions where org_id = p_org for update;
  -- Continue from the current paid-up date if still running, else from the payment date.
  v_from := greatest(coalesce(s.paid_until, p_paid_on - 1), p_paid_on - 1);
  v_until := (v_from + make_interval(months => p_months))::date;
  insert into public.subscription_payments (org_id, amount_cents, paid_on, months, method, reference, note, paid_until_after, recorded_by)
  values (p_org, p_amount_cents, p_paid_on, p_months, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), v_until, auth.uid());
  update public.subscriptions set status = 'active', paid_until = v_until, updated_at = now(), updated_by = auth.uid() where org_id = p_org;
  return v_until;
end $$;

-- Trial end date, cancel / reactivate, special price, notes.
create function public.admin_update_subscription(
  p_org uuid, p_status public.subscription_status, p_trial_ends date, p_price_override_cents bigint, p_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  insert into public.subscriptions (org_id) values (p_org) on conflict (org_id) do nothing;
  update public.subscriptions
     set status = p_status, trial_ends = p_trial_ends, price_override_cents = p_price_override_cents,
         notes = nullif(btrim(p_notes), ''), updated_at = now(), updated_by = auth.uid()
   where org_id = p_org;
end $$;

-- Buildings now carry their owner's plan and billing status.
drop function public.admin_buildings();
create function public.admin_buildings()
returns table (
  building_id uuid, org_id uuid, org_name text, name text, location text, created_at timestamptz,
  units int, filled int, owed_cents bigint, last_upload_at timestamptz, plan public.org_plan, billing text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select b.id, b.org_id, o.name, b.name, b.location, b.created_at,
         (select count(*)::int from public.units u where u.building_id = b.id and u.archived_at is null),
         (select count(*)::int from public.units u where u.building_id = b.id and u.archived_at is null and u.status = 'occupied'),
         (select coalesce(sum(greatest(lo.balance_cents, 0)), 0)::bigint from public.lease_overview lo where lo.building_id = b.id and lo.status = 'active'),
         (select max(su.created_at) from public.statement_uploads su where su.building_id = b.id),
         o.plan, public.billing_status(o.plan, s)
    from public.buildings b
    join public.orgs o on o.id = b.org_id
    left join public.subscriptions s on s.org_id = o.id
   where b.archived_at is null
   order by b.created_at desc;
end $$;

revoke execute on function public.admin_billing(), public.admin_subscription_payments(uuid), public.admin_plan_prices(),
  public.admin_set_plan_price(public.org_plan, bigint),
  public.admin_record_subscription_payment(uuid, bigint, date, int, text, text, text),
  public.admin_update_subscription(uuid, public.subscription_status, date, bigint, text),
  public.admin_buildings(), public.billing_status(public.org_plan, public.subscriptions) from public, anon;
grant execute on function public.admin_billing(), public.admin_subscription_payments(uuid), public.admin_plan_prices(),
  public.admin_set_plan_price(public.org_plan, bigint),
  public.admin_record_subscription_payment(uuid, bigint, date, int, text, text, text),
  public.admin_update_subscription(uuid, public.subscription_status, date, bigint, text),
  public.admin_buildings(), public.billing_status(public.org_plan, public.subscriptions) to authenticated;
revoke execute on function public.start_subscription() from public, anon, authenticated;
