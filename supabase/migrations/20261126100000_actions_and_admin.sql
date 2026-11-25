-- RentFlow v2 — small working actions for the redesign (cash payments,
-- reminders, move-out), phone at sign-up, and read-only staff access for the
-- internal admin.

-- ── Phone from sign-up metadata ───────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g');
begin
  insert into public.profiles (user_id, email, full_name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), nullif(v_phone, ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

-- ── Cash payment: recorded by hand, posted straight away ─────────────────
create function public.record_cash_payment(p_lease uuid, p_amount bigint, p_paid_on date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  l public.leases;
  v_event uuid;
  v_code text := 'CASH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  select * into l from public.leases where id = p_lease;
  if not found or not public.can_operate(l.org_id) then perform public._deny(); end if;
  if l.status <> 'active' then raise exception 'This tenant has moved out.' using errcode = 'P0001'; end if;
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

-- ── Outbox: queue an SMS for a tenant (sent by the worker in phase 4) ─────
create function public.queue_message(p_lease uuid, p_kind public.message_kind, p_body text, p_payment uuid default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  l public.leases;
  v_phone text;
begin
  select * into l from public.leases where id = p_lease;
  if not found or not public.can_operate(l.org_id) then perform public._deny(); end if;
  select phone into v_phone from public.tenant_phones where tenant_id = l.tenant_id order by is_primary desc, created_at limit 1;
  if v_phone is null then
    raise exception 'This tenant has no phone number. Add one first.' using errcode = 'P0001';
  end if;
  if p_kind = 'reminder' and exists (
    select 1 from public.messages
     where tenant_id = l.tenant_id and kind = 'reminder' and created_at > now() - interval '20 hours'
  ) then
    raise exception 'You already reminded this tenant today.' using errcode = 'P0001';
  end if;
  insert into public.messages (org_id, kind, to_phone, body, tenant_id, payment_id, created_by)
  values (l.org_id, p_kind, v_phone, left(p_body, 1600), l.tenant_id, p_payment, auth.uid());
  return 1;
end $$;

-- ── Move out: end the tenancy and free the unit ───────────────────────────
create function public.end_tenancy(p_lease uuid, p_end_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.leases;
begin
  select * into l from public.leases where id = p_lease for update;
  if not found or not public.can_manage(l.org_id) then perform public._deny(); end if;
  if l.status <> 'active' then raise exception 'This tenant has already moved out.' using errcode = 'P0001'; end if;
  if p_end_date is null or p_end_date < l.start_date then
    raise exception 'The move-out date must be after they moved in.' using errcode = 'P0001';
  end if;
  update public.leases set status = 'ended', end_date = p_end_date, ended_at = now() where id = l.id;
  update public.units set status = 'vacant' where id = l.unit_id;
end $$;

-- ── Internal admin: read-only views across all accounts (staff only) ──────
create function public.admin_landlords()
returns table (
  org_id uuid, name text, plan public.org_plan, created_at timestamptz, owner_email text, owner_name text,
  buildings int, units int, tenants int, owed_cents bigint, collected_this_month_cents bigint, messages_this_month int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select o.id, o.name, o.plan, o.created_at,
         (select p.email from public.members m join public.profiles p on p.user_id = m.user_id where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1),
         (select p.full_name from public.members m join public.profiles p on p.user_id = m.user_id where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1),
         (select count(*)::int from public.buildings b where b.org_id = o.id and b.archived_at is null),
         (select count(*)::int from public.units u where u.org_id = o.id and u.archived_at is null),
         (select count(*)::int from public.leases l where l.org_id = o.id and l.status = 'active'),
         (select coalesce(sum(greatest(lo.balance_cents, 0)), 0)::bigint from public.lease_overview lo where lo.org_id = o.id and lo.status = 'active'),
         (select coalesce(sum(lo.paid_this_month_cents), 0)::bigint from public.lease_overview lo where lo.org_id = o.id),
         (select count(*)::int from public.messages ms where ms.org_id = o.id and ms.created_at >= date_trunc('month', now()))
    from public.orgs o
   order by o.created_at desc;
end $$;

create function public.admin_buildings()
returns table (
  building_id uuid, org_id uuid, org_name text, name text, location text, created_at timestamptz,
  units int, filled int, owed_cents bigint, last_upload_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select b.id, b.org_id, o.name, b.name, b.location, b.created_at,
         (select count(*)::int from public.units u where u.building_id = b.id and u.archived_at is null),
         (select count(*)::int from public.units u where u.building_id = b.id and u.archived_at is null and u.status = 'occupied'),
         (select coalesce(sum(greatest(lo.balance_cents, 0)), 0)::bigint from public.lease_overview lo where lo.building_id = b.id and lo.status = 'active'),
         (select max(su.created_at) from public.statement_uploads su where su.building_id = b.id)
    from public.buildings b join public.orgs o on o.id = b.org_id
   where b.archived_at is null
   order by b.created_at desc;
end $$;

-- "Agents": RentFlow staff and the accounts each one set up.
create function public.admin_agents()
returns table (user_id uuid, email text, full_name text, since timestamptz, accounts_set_up int, units_set_up int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select a.user_id, p.email, p.full_name, a.created_at,
         (select count(*)::int from public.orgs o where o.created_by = a.user_id),
         (select count(*)::int from public.units u join public.orgs o on o.id = u.org_id where o.created_by = a.user_id)
    from public.platform_admins a left join public.profiles p on p.user_id = a.user_id
   order by a.created_at;
end $$;

create function public.admin_sms_usage()
returns table (org_id uuid, org_name text, month date, kind public.message_kind, queued int, sent int, delivered int, failed int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform public._deny(); end if;
  return query
  select m.org_id, o.name, date_trunc('month', m.created_at)::date, m.kind,
         count(*) filter (where m.status in ('queued', 'sending'))::int,
         count(*) filter (where m.status = 'sent')::int,
         count(*) filter (where m.status = 'delivered')::int,
         count(*) filter (where m.status = 'failed')::int
    from public.messages m join public.orgs o on o.id = m.org_id
   where m.created_at >= date_trunc('month', now()) - interval '5 months'
   group by m.org_id, o.name, date_trunc('month', m.created_at), m.kind
   order by 3 desc, 2;
end $$;

revoke execute on function public.admin_landlords(), public.admin_buildings(), public.admin_agents(), public.admin_sms_usage(),
  public.record_cash_payment(uuid, bigint, date, text), public.queue_message(uuid, public.message_kind, text, uuid),
  public.end_tenancy(uuid, date) from public, anon;
grant execute on function public.admin_landlords(), public.admin_buildings(), public.admin_agents(), public.admin_sms_usage(),
  public.record_cash_payment(uuid, bigint, date, text), public.queue_message(uuid, public.message_kind, text, uuid),
  public.end_tenancy(uuid, date) to authenticated;
