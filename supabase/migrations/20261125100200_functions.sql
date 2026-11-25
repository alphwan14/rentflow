-- RentFlow v2 — functions. Every function that writes money is SECURITY
-- DEFINER with an empty search_path, checks the caller's role itself, and is
-- the only way to touch charges, payments and the ledger.

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Kenya is UTC+3 all year (no DST).
create function public.nairobi_today() returns date
language sql stable set search_path = '' as $$
  select ((now() at time zone 'UTC') + interval '3 hours')::date
$$;

create function public.nairobi_date(p_ts timestamptz) returns date
language sql stable set search_path = '' as $$
  select ((p_ts at time zone 'UTC') + interval '3 hours')::date
$$;

create function public.unit_code_key(p_code text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), '(^|[^0-9])0+([0-9])', '\1\2', 'g')
$$;

create function public.due_date_for(p_period date, p_due_day int) returns date
language sql immutable set search_path = '' as $$
  select (date_trunc('month', p_period)::date + (least(greatest(p_due_day, 1), 28) - 1))
$$;

create function public.org_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m where m.org_id = p_org and m.user_id = auth.uid()
$$;

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid())
$$;

create function public.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'manager'))
$$;

create function public.can_operate(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'manager', 'caretaker'))
$$;

create function public.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner')
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

create function public._deny(p_msg text default 'You don''t have permission to do that') returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_msg using errcode = '42501';
end $$;

-- ── Plans (feature gating; billing comes later) ───────────────────────────
-- Mirrors src/core/plans.ts. Automatic matching is never gated.
create function public._assert_unit_capacity(p_org uuid, p_adding int) returns void
language plpgsql set search_path = '' as $$
declare
  v_plan public.org_plan;
  v_count int;
begin
  select plan into v_plan from public.orgs where id = p_org;
  if v_plan = 'free' then
    select count(*) into v_count from public.units where org_id = p_org and archived_at is null;
    if v_count + p_adding > 10 then
      raise exception 'plan_limit: The Free plan covers up to 10 units. Upgrade to Growth to add more.' using errcode = 'P0001';
    end if;
  end if;
end $$;

create function public._assert_building_capacity(p_org uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_plan public.org_plan;
begin
  select plan into v_plan from public.orgs where id = p_org;
  if v_plan <> 'pro' and exists (select 1 from public.buildings where org_id = p_org and archived_at is null) then
    raise exception 'plan_limit: More than one building needs the Pro plan.' using errcode = 'P0001';
  end if;
end $$;

-- ── New users ──────────────────────────────────────────────────────────────
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Audit ──────────────────────────────────────────────────────────────────
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid;
begin
  v_org := case when tg_table_name = 'orgs' then (v_row ->> 'id')::uuid else (v_row ->> 'org_id')::uuid end;
  insert into public.audit_log (org_id, actor, action, entity, entity_id, data)
  values (
    v_org, auth.uid(), lower(tg_op), tg_table_name, nullif(v_row ->> 'id', '')::uuid,
    case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else v_row end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orgs', 'members', 'buildings', 'payout_channels', 'units', 'tenants', 'tenant_phones',
                           'leases', 'charges', 'payments', 'match_rules']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end $$;
create trigger audit_payment_events after update on public.payment_events
  for each row when (old.status is distinct from new.status) execute function public.audit_row();

-- ── Orgs & team ────────────────────────────────────────────────────────────
create function public.create_org(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then perform public._deny('Sign in first'); end if;
  insert into public.orgs (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_org;
  insert into public.members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end $$;

create function public.set_org_plan(p_org uuid, p_plan public.org_plan) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  update public.orgs set plan = p_plan where id = p_org;
end $$;

create function public.create_invite(p_org uuid, p_role public.member_role) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_plan public.org_plan;
  v_caretakers int;
  v_buildings int;
begin
  if p_role = 'owner' then perform public._deny('Owners can''t be invited. Invite a manager instead.'); end if;
  if not (public.is_owner(p_org) or (public.can_manage(p_org) and p_role in ('caretaker', 'viewer'))) then
    perform public._deny();
  end if;
  if p_role = 'caretaker' then
    select plan into v_plan from public.orgs where id = p_org;
    select count(*) into v_caretakers from public.members where org_id = p_org and role = 'caretaker';
    select count(*) into v_buildings from public.buildings where org_id = p_org and archived_at is null;
    if v_plan = 'free' then
      raise exception 'plan_limit: Caretaker access needs the Growth plan.' using errcode = 'P0001';
    elsif v_plan = 'growth' and v_caretakers >= greatest(v_buildings, 1) then
      raise exception 'plan_limit: Growth includes one caretaker per building. Pro has unlimited caretakers.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.org_invites (org_id, role, token_hash, created_by)
  values (p_org, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  return v_token;
end $$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.org_invites;
begin
  if auth.uid() is null then perform public._deny('Sign in first'); end if;
  select * into v_inv from public.org_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;
  if not found or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'This invite link has expired or was already used. Ask for a new one.' using errcode = 'P0001';
  end if;
  insert into public.members (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_org) then perform public._deny('Only owners can change roles'); end if;
  if p_role <> 'owner' and exists (select 1 from public.members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'Every organisation needs at least one owner.' using errcode = 'P0001';
  end if;
  update public.members set role = p_role where org_id = p_org and user_id = p_user;
end $$;

create function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_owner(p_org) or p_user = auth.uid()) then perform public._deny(); end if;
  if exists (select 1 from public.members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'Every organisation needs at least one owner.' using errcode = 'P0001';
  end if;
  delete from public.members where org_id = p_org and user_id = p_user;
end $$;

-- ── Buildings & units ─────────────────────────────────────────────────────
-- p_units: [{code, rent_cents, deposit_cents}]; p_channel: {kind, number, bank_name, account_hint} or null.
create function public.create_building(
  p_org uuid, p_name text, p_location text, p_due_day int, p_tracking_from date, p_units jsonb, p_channel jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_building uuid;
begin
  if not public.can_manage(p_org) then perform public._deny(); end if;
  perform public._assert_building_capacity(p_org);
  perform public._assert_unit_capacity(p_org, coalesce(jsonb_array_length(p_units), 0));
  insert into public.buildings (org_id, name, location, default_due_day, tracking_from)
  values (p_org, btrim(p_name), nullif(btrim(p_location), ''), coalesce(p_due_day, 5),
          date_trunc('month', coalesce(p_tracking_from, public.nairobi_today()))::date)
  returning id into v_building;
  insert into public.units (org_id, building_id, code, rent_cents, deposit_cents)
  select p_org, v_building, upper(btrim(u.code)), coalesce(u.rent_cents, 0), coalesce(u.deposit_cents, 0)
  from jsonb_to_recordset(coalesce(p_units, '[]')) as u(code text, rent_cents bigint, deposit_cents bigint);
  if p_channel is not null and coalesce(p_channel ->> 'number', '') <> '' then
    insert into public.payout_channels (org_id, building_id, kind, number, bank_name, account_hint)
    values (p_org, v_building, (p_channel ->> 'kind')::public.payout_kind, btrim(p_channel ->> 'number'),
            nullif(p_channel ->> 'bank_name', ''), coalesce(nullif(p_channel ->> 'account_hint', ''), 'Your unit code, e.g. B12'))
    on conflict (org_id, kind, number) do nothing;
  end if;
  return v_building;
end $$;

create function public.add_units(p_building uuid, p_units jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_n int;
begin
  select org_id into v_org from public.buildings where id = p_building;
  if v_org is null or not public.can_manage(v_org) then perform public._deny(); end if;
  perform public._assert_unit_capacity(v_org, coalesce(jsonb_array_length(p_units), 0));
  insert into public.units (org_id, building_id, code, rent_cents, deposit_cents)
  select v_org, p_building, upper(btrim(u.code)), coalesce(u.rent_cents, 0), coalesce(u.deposit_cents, 0)
  from jsonb_to_recordset(p_units) as u(code text, rent_cents bigint, deposit_cents bigint);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── Charges ───────────────────────────────────────────────────────────────
-- Internal: create a charge and its ledger entry. Returns null if this
-- recurring charge already exists for the period (idempotent).
create function public._post_charge(
  p_lease uuid, p_kind public.charge_kind, p_period date, p_due date, p_amount bigint, p_description text, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.leases where id = p_lease;
  insert into public.charges (org_id, lease_id, kind, period, due_date, amount_cents, description, created_by)
  values (v_org, p_lease, p_kind, p_period, p_due, p_amount, p_description, p_actor)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date, charge_id, memo, created_by)
  values (v_org, p_lease, 'charge', p_amount, p_due, v_id, p_description, p_actor);
  return v_id;
end $$;

-- Internal: bill rent for every month from the later of lease start and the
-- building's tracking start, through p_through. Idempotent.
create function public.generate_rent_charges(p_lease uuid, p_through date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  v_p date;
  v_end date;
  v_due date;
  v_n int := 0;
begin
  select le.id, le.start_date, le.end_date, le.status, le.rent_cents, le.due_day, b.tracking_from
    into l
    from public.leases le
    join public.units u on u.id = le.unit_id
    join public.buildings b on b.id = u.building_id
   where le.id = p_lease;
  if not found then return 0; end if;
  v_p := greatest(date_trunc('month', l.start_date)::date, l.tracking_from);
  v_end := date_trunc('month', least(p_through, coalesce(l.end_date, p_through)))::date;
  while v_p <= v_end loop
    v_due := greatest(public.due_date_for(v_p, l.due_day), l.start_date);
    if public._post_charge(l.id, 'rent', v_p, v_due, l.rent_cents, null, null) is not null then
      v_n := v_n + 1;
    end if;
    v_p := (v_p + interval '1 month')::date;
  end loop;
  return v_n;
end $$;

-- Cron: bill this month's rent for every active lease. Safe to run daily.
create function public.run_monthly_charges(p_today date default null) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_today date := coalesce(p_today, public.nairobi_today());
begin
  for r in select id from public.leases where status = 'active' loop
    v_n := v_n + public.generate_rent_charges(r.id, v_today);
  end loop;
  return v_n;
end $$;

-- What is still unpaid on one charge, oldest-debt-first across the lease.
create function public.charge_outstanding(p_charge uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  with c as (select lease_id from public.charges where id = p_charge),
  live as (
    select e.* from public.ledger_entries e, c
     where e.lease_id = c.lease_id and e.kind <> 'reversal'
       and not exists (select 1 from public.ledger_entries r where r.reverses_id = e.id)
  ),
  credit as (select coalesce(-sum(amount_cents), 0) as total from live where amount_cents < 0),
  debit as (
    select charge_id, amount_cents, sum(amount_cents) over (order by effective_date, seq) as running
      from live where amount_cents > 0
  )
  select coalesce((select least(d.amount_cents, greatest(0, d.running - credit.total)) from debit d, credit where d.charge_id = p_charge), 0)
$$;

-- Cron: add a late fee to this month's rent that is still unpaid after the grace period.
create function public.apply_late_fees(p_today date default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n int := 0;
  v_today date := coalesce(p_today, public.nairobi_today());
  v_amount bigint;
begin
  for r in
    select c.id, c.lease_id, c.period, l.rent_cents, b.late_fee_kind, b.late_fee_value
      from public.charges c
      join public.leases l on l.id = c.lease_id
      join public.units u on u.id = l.unit_id
      join public.buildings b on b.id = u.building_id
     where c.kind = 'rent' and l.status = 'active'
       and b.late_fee_enabled and b.late_fee_value > 0
       and c.period = date_trunc('month', v_today)::date
       and c.due_date + b.late_fee_grace_days < v_today
       and not exists (select 1 from public.ledger_entries e join public.ledger_entries r2 on r2.reverses_id = e.id where e.charge_id = c.id)
  loop
    if public.charge_outstanding(r.id) > 0 then
      v_amount := case when r.late_fee_kind = 'flat' then r.late_fee_value else (r.rent_cents * r.late_fee_value) / 10000 end;
      if v_amount > 0 and public._post_charge(r.lease_id, 'late_fee', r.period, v_today, v_amount,
            'Late fee ' || to_char(r.period, 'Mon YYYY'), null) is not null then
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

-- One-off charges (water, garbage, deposit…). Caretakers can bill water.
create function public.add_charge(
  p_lease uuid, p_kind public.charge_kind, p_amount bigint, p_due_date date, p_description text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.leases where id = p_lease;
  if v_org is null or not public.can_operate(v_org) then perform public._deny(); end if;
  if p_kind in ('rent', 'arrears_bf') then
    raise exception 'Rent is billed automatically every month.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be more than zero.' using errcode = 'P0001';
  end if;
  v_id := public._post_charge(p_lease, p_kind, date_trunc('month', p_due_date)::date, p_due_date, p_amount,
                              nullif(btrim(p_description), ''), auth.uid());
  if v_id is null then
    raise exception 'That charge has already been added for this month.' using errcode = 'P0001';
  end if;
  return v_id;
end $$;

create function public.void_charge(p_charge uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ledger_entries;
begin
  select * into e from public.ledger_entries where charge_id = p_charge;
  if not found or not public.can_manage(e.org_id) then perform public._deny(); end if;
  if exists (select 1 from public.ledger_entries where reverses_id = e.id) then
    raise exception 'This charge was already cancelled.' using errcode = 'P0001';
  end if;
  insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date, reverses_id, memo, created_by)
  values (e.org_id, e.lease_id, 'reversal', -e.amount_cents, public.nairobi_today(), e.id,
          coalesce(nullif(btrim(p_note), ''), 'Charge cancelled'), auth.uid());
end $$;

-- ── Tenants (onboarding import) ───────────────────────────────────────────
-- p_rows: [{unit_code, full_name, phones[], id_number, rent_cents, deposit_cents, opening_balance_cents, start_date}]
create function public.import_tenants(p_building uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  b public.buildings;
  r record;
  v_unit public.units;
  v_tenant uuid;
  v_lease uuid;
  v_n int := 0;
  v_bf_date date;
begin
  select * into b from public.buildings where id = p_building;
  if not found or not public.can_manage(b.org_id) then perform public._deny(); end if;
  v_bf_date := b.tracking_from - 1;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      unit_code text, full_name text, phones text[], id_number text, rent_cents bigint,
      deposit_cents bigint, opening_balance_cents bigint, start_date date)
  loop
    select * into v_unit from public.units
     where building_id = p_building and archived_at is null and code_key = public.unit_code_key(r.unit_code);
    if not found then
      raise exception 'Unit % isn''t in this building.', r.unit_code using errcode = 'P0001';
    end if;
    if exists (select 1 from public.leases where unit_id = v_unit.id and status = 'active') then
      raise exception 'Unit % already has a tenant.', v_unit.code using errcode = 'P0001';
    end if;

    insert into public.tenants (org_id, full_name, id_number)
    values (b.org_id, btrim(r.full_name), nullif(btrim(r.id_number), ''))
    returning id into v_tenant;

    insert into public.tenant_phones (org_id, tenant_id, phone, is_primary)
    select b.org_id, v_tenant, p.phone, p.ord = 1
      from unnest(coalesce(r.phones, '{}')) with ordinality as p(phone, ord)
    on conflict do nothing;

    insert into public.leases (org_id, unit_id, tenant_id, start_date, rent_cents, deposit_cents, due_day)
    values (b.org_id, v_unit.id, v_tenant, coalesce(r.start_date, b.tracking_from),
            coalesce(nullif(r.rent_cents, 0), v_unit.rent_cents), coalesce(r.deposit_cents, v_unit.deposit_cents, 0),
            b.default_due_day)
    returning id into v_lease;

    update public.units
       set status = 'occupied',
           rent_cents = case when rent_cents = 0 then coalesce(r.rent_cents, 0) else rent_cents end,
           deposit_cents = case when deposit_cents = 0 then coalesce(r.deposit_cents, 0) else deposit_cents end
     where id = v_unit.id;

    if coalesce(r.opening_balance_cents, 0) > 0 then
      perform public._post_charge(v_lease, 'arrears_bf', null, v_bf_date, r.opening_balance_cents,
                                  'Balance brought forward', auth.uid());
    elsif coalesce(r.opening_balance_cents, 0) < 0 then
      insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date, memo, created_by)
      values (b.org_id, v_lease, 'adjustment', r.opening_balance_cents, v_bf_date, 'Credit brought forward', auth.uid());
    end if;

    perform public.generate_rent_charges(v_lease, public.nairobi_today());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ── Payments ──────────────────────────────────────────────────────────────
-- Internal: post a payment event to one or more leases.
-- p_allocations: [{lease_id, amount_cents}] summing to the event amount.
create function public._post_payment(
  p_event uuid, p_allocations jsonb, p_method text, p_confidence numeric, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.payment_events;
  v_total bigint;
  v_pay uuid;
begin
  select * into e from public.payment_events where id = p_event for update;
  if not found then raise exception 'Payment not found.' using errcode = 'P0001'; end if;
  if e.status = 'matched' then raise exception 'This payment has already been posted.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Choose who this payment is for.' using errcode = 'P0001';
  end if;
  select sum((x ->> 'amount_cents')::bigint) into v_total from jsonb_array_elements(p_allocations) x;
  if v_total is distinct from e.amount_cents then
    raise exception 'The split (%) must add up to the payment (%).', v_total, e.amount_cents using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x where (x ->> 'amount_cents')::bigint <= 0) then
    raise exception 'Each part of the split must be more than zero.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_allocations) x
      left join public.leases l on l.id = (x ->> 'lease_id')::uuid and l.org_id = e.org_id
     where l.id is null
  ) then
    perform public._deny('That tenancy isn''t in your organisation');
  end if;

  insert into public.payments (org_id, event_id, amount_cents, paid_at, method, reference, lease_id, match_method, confidence, created_by)
  values (e.org_id, e.id, e.amount_cents, e.occurred_at, e.source, e.trans_code,
          (p_allocations -> 0 ->> 'lease_id')::uuid, p_method, p_confidence, p_actor)
  returning id into v_pay;

  insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date, payment_id, memo, created_by)
  select e.org_id, (x ->> 'lease_id')::uuid, 'payment', -((x ->> 'amount_cents')::bigint),
         public.nairobi_date(e.occurred_at), v_pay, e.trans_code, p_actor
    from jsonb_array_elements(p_allocations) x;

  update public.payment_events
     set status = 'matched', confidence = coalesce(p_confidence, confidence),
         processed_at = coalesce(processed_at, now()), resolved_by = p_actor, resolved_at = now()
   where id = e.id;
  return v_pay;
end $$;

-- Internal: remember payer → tenant links. p_rules: [{kind, pattern, tenant_id}]
create function public._learn_rules(p_org uuid, p_rules jsonb, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.match_rules (org_id, kind, pattern, tenant_id, hits, created_by)
  select p_org, (x ->> 'kind')::public.rule_kind, x ->> 'pattern', (x ->> 'tenant_id')::uuid, 1, p_actor
    from jsonb_array_elements(coalesce(p_rules, '[]')) x
    join public.tenants t on t.id = (x ->> 'tenant_id')::uuid and t.org_id = p_org
   where length(x ->> 'pattern') between 3 and 120
  on conflict (org_id, kind, pattern, tenant_id) do update set hits = public.match_rules.hits + 1;
end $$;

-- "Who paid this?" — the landlord confirms in one tap; RentFlow learns.
create function public.post_payment(p_event uuid, p_allocations jsonb, p_rules jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_pay uuid;
begin
  select org_id into v_org from public.payment_events where id = p_event;
  if v_org is null or not public.can_manage(v_org) then perform public._deny(); end if;
  v_pay := public._post_payment(p_event, p_allocations, 'confirmed', null, auth.uid());
  perform public._learn_rules(v_org, p_rules, auth.uid());
  return v_pay;
end $$;

-- Store a statement's payments once. Returns {upload_id, inserted: [{id, trans_code}], duplicates}.
-- p_events: [{trans_code, amount_cents, occurred_at, payer_phone, payer_phone_masked, payer_name, account_ref, raw}]
create function public.ingest_statement(p_org uuid, p_building uuid, p_meta jsonb, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_upload uuid;
  v_inserted jsonb;
  v_total int := coalesce(jsonb_array_length(p_events), 0);
  v_new int;
begin
  if not public.can_manage(p_org) then perform public._deny(); end if;
  if p_building is not null and not exists (select 1 from public.buildings where id = p_building and org_id = p_org) then
    perform public._deny();
  end if;
  insert into public.statement_uploads (org_id, building_id, filename, format, period_start, period_end, total_payments, skipped_lines, uploaded_by)
  values (p_org, p_building, coalesce(p_meta ->> 'filename', 'statement'), coalesce(p_meta ->> 'format', 'M-Pesa statement'),
          (p_meta ->> 'period_start')::date, (p_meta ->> 'period_end')::date, v_total,
          coalesce((p_meta ->> 'skipped_lines')::int, 0), auth.uid())
  returning id into v_upload;

  with incoming as (
    select * from jsonb_to_recordset(p_events) as x(
      trans_code text, amount_cents bigint, occurred_at timestamptz, payer_phone text,
      payer_phone_masked text, payer_name text, account_ref text, raw jsonb)
  ), ins as (
    insert into public.payment_events (org_id, source, trans_code, amount_cents, occurred_at, payer_phone,
                                       payer_phone_masked, payer_name, account_ref, building_id, upload_id, raw)
    select p_org, 'mpesa_statement', upper(trans_code), amount_cents, occurred_at, payer_phone,
           payer_phone_masked, payer_name, nullif(btrim(account_ref), ''), p_building, v_upload, coalesce(raw, '{}')
      from incoming
    on conflict (org_id, trans_code) do nothing
    returning id, trans_code
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'trans_code', trans_code)), '[]') into v_inserted from ins;

  v_new := jsonb_array_length(v_inserted);
  update public.statement_uploads set new_events = v_new, duplicate_events = v_total - v_new where id = v_upload;
  return jsonb_build_object('upload_id', v_upload, 'inserted', v_inserted, 'duplicates', v_total - v_new);
end $$;

-- Save the engine's decisions: post sure matches, park the rest in the inbox.
-- p_results: [{event_id, decision, confidence, suggestion, allocations, suggested_lease_ids}]
create function public.apply_match_results(p_upload uuid, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  e public.payment_events;
  v_auto int := 0;
  v_suggest int := 0;
  v_none int := 0;
begin
  for r in
    select * from jsonb_to_recordset(p_results) as x(
      event_id uuid, decision text, confidence numeric, suggestion jsonb, allocations jsonb, suggested_lease_ids uuid[])
  loop
    select * into e from public.payment_events where id = r.event_id;
    if not found or not public.can_manage(e.org_id) then perform public._deny(); end if;
    if e.status in ('matched', 'ignored') then continue; end if;
    if r.decision = 'auto' then
      perform public._post_payment(e.id, r.allocations, 'auto', r.confidence, auth.uid());
      update public.payment_events set suggestion = r.suggestion where id = e.id;
      v_auto := v_auto + 1;
    else
      update public.payment_events
         set status = (case when r.decision = 'suggest' then 'suggested' else 'unmatched' end)::public.event_status,
             confidence = r.confidence, suggestion = r.suggestion, suggested_lease_ids = r.suggested_lease_ids,
             processed_at = now()
       where id = e.id;
      if r.decision = 'suggest' then v_suggest := v_suggest + 1; else v_none := v_none + 1; end if;
    end if;
  end loop;
  if p_upload is not null then
    update public.statement_uploads
       set auto_matched = auto_matched + v_auto, suggested = suggested + v_suggest, unmatched = unmatched + v_none
     where id = p_upload;
  end if;
  return jsonb_build_object('auto', v_auto, 'suggested', v_suggest, 'unmatched', v_none);
end $$;

-- Undo a posted payment. History stays; the event goes back to the inbox.
create function public.reverse_payment(p_payment uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found or not public.can_manage(p.org_id) then perform public._deny(); end if;
  if p.status = 'reversed' then raise exception 'This payment was already reversed.' using errcode = 'P0001'; end if;
  insert into public.ledger_entries (org_id, lease_id, kind, amount_cents, effective_date, reverses_id, memo, created_by)
  select org_id, lease_id, 'reversal', -amount_cents, public.nairobi_today(), id,
         coalesce(nullif(btrim(p_note), ''), 'Payment reversed'), auth.uid()
    from public.ledger_entries where payment_id = p.id and kind = 'payment';
  update public.payments
     set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_note = nullif(btrim(p_note), '')
   where id = p.id;
  update public.payment_events set status = 'unmatched', resolved_by = null, resolved_at = null where id = p.event_id;
end $$;

-- Not rent (a personal transfer, a refund…): hide it from the inbox.
create function public.set_event_ignored(p_event uuid, p_ignored boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.payment_events;
begin
  select * into e from public.payment_events where id = p_event for update;
  if not found or not public.can_manage(e.org_id) then perform public._deny(); end if;
  if e.status = 'matched' then raise exception 'Reverse the payment first.' using errcode = 'P0001'; end if;
  update public.payment_events
     set status = (case when p_ignored then 'ignored' else 'unmatched' end)::public.event_status,
         resolved_by = case when p_ignored then auth.uid() end,
         resolved_at = case when p_ignored then now() end
   where id = e.id;
end $$;

-- ── Job queue (worker, phase 4) ───────────────────────────────────────────
create function public.enqueue_job(p_kind text, p_org uuid, p_payload jsonb, p_run_at timestamptz default now()) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.jobs (kind, org_id, payload, run_at) values (p_kind, p_org, coalesce(p_payload, '{}'), p_run_at) returning id
$$;

create function public.claim_jobs(p_worker text, p_limit int default 10) returns setof public.jobs
language sql security definer set search_path = '' as $$
  update public.jobs j
     set locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   where j.id in (
     select id from public.jobs
      where done_at is null and run_at <= now() and attempts < max_attempts
        and (locked_at is null or locked_at < now() - interval '5 minutes')
      order by run_at
      limit p_limit
      for update skip locked)
  returning j.*
$$;

create function public.complete_job(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.jobs set done_at = now(), locked_at = null, last_error = null where id = p_id
$$;

create function public.fail_job(p_id bigint, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.jobs
     set locked_at = null, last_error = left(p_error, 2000),
         run_at = now() + least(interval '1 hour', interval '15 seconds' * power(2, attempts))
   where id = p_id
$$;

-- Live notifications are matched by the worker: queue them on arrival.
create function public.enqueue_live_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source in ('daraja_c2b', 'kcb_buni') then
    perform public.enqueue_job('match_event', new.org_id, jsonb_build_object('event_id', new.id));
  end if;
  return null;
end $$;
create trigger payment_events_enqueue after insert on public.payment_events
  for each row execute function public.enqueue_live_event();

-- ── Views (security_invoker: the caller's RLS applies) ────────────────────
create view public.lease_overview with (security_invoker = true) as
select
  l.id as lease_id, l.org_id, l.status, l.start_date, l.end_date, l.rent_cents, l.deposit_cents, l.due_day,
  u.id as unit_id, u.code as unit_code, u.code_key, u.building_id, b.name as building_name,
  t.id as tenant_id, t.full_name as tenant_name,
  coalesce(s.balance_cents, 0)::bigint as balance_cents,
  coalesce(s.credits_cents, 0)::bigint as credits_cents,
  s.oldest_unpaid_due,
  s.last_paid_on,
  coalesce(s.paid_this_month_cents, 0)::bigint as paid_this_month_cents,
  coalesce((select array_agg(p.phone order by p.is_primary desc, p.created_at) from public.tenant_phones p where p.tenant_id = t.id), '{}') as phones
from public.leases l
join public.units u on u.id = l.unit_id
join public.buildings b on b.id = u.building_id
join public.tenants t on t.id = l.tenant_id
left join lateral (
  with live as (
    select e.amount_cents, e.effective_date, e.seq, e.kind
      from public.ledger_entries e
     where e.lease_id = l.id and e.kind <> 'reversal'
       and not exists (select 1 from public.ledger_entries r where r.reverses_id = e.id)
  ),
  credit as (select coalesce(-sum(amount_cents), 0) as total from live where amount_cents < 0),
  debit as (select effective_date, sum(amount_cents) over (order by effective_date, seq) as running from live where amount_cents > 0)
  select
    (select coalesce(sum(amount_cents), 0) from live) as balance_cents,
    (select total from credit) as credits_cents,
    (select min(d.effective_date) from debit d, credit where d.running > credit.total) as oldest_unpaid_due,
    (select max(effective_date) from live where kind = 'payment') as last_paid_on,
    (select coalesce(-sum(amount_cents), 0) from live
      where kind = 'payment' and effective_date >= date_trunc('month', public.nairobi_today())::date) as paid_this_month_cents
) s on true;

-- Billed vs collected per month (reversed entries excluded; balance b/f is not "billed").
create view public.monthly_collections with (security_invoker = true) as
select
  e.org_id,
  u.building_id,
  date_trunc('month', e.effective_date)::date as period,
  coalesce(sum(e.amount_cents) filter (where e.kind = 'charge' and c.kind <> 'arrears_bf'), 0)::bigint as billed_cents,
  coalesce(-sum(e.amount_cents) filter (where e.kind = 'payment'), 0)::bigint as collected_cents
from public.ledger_entries e
join public.leases l on l.id = e.lease_id
join public.units u on u.id = l.unit_id
left join public.charges c on c.id = e.charge_id
where e.kind in ('charge', 'payment')
  and not exists (select 1 from public.ledger_entries r where r.reverses_id = e.id)
group by e.org_id, u.building_id, date_trunc('month', e.effective_date);
