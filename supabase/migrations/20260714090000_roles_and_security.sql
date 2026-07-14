-- =============================================================================
-- Roles & security hardening for multi-user organizations.
--
-- ADDITIVE & BACKWARD-COMPATIBLE:
--   * Role set expands from (admin, staff) to (owner, admin, staff, caretaker,
--     viewer). Existing rows stay valid; each org's earliest admin is promoted
--     to 'owner' (same capabilities as admin, plus ownership transfer later).
--   * Write policies on tenants/rental_units are recreated in the SAME
--     transaction as the promotion, swapping rf_role()='admin' for
--     rf_is_admin() (owner|admin) — promoted owners never lose access.
--   * record_payment, receipt numbering, the ledger, the SMS pipeline and the
--     worker RPCs (claim_sms_batch / reap_stuck_sms) are NOT touched.
--
-- SECURITY FIXES:
--   (A) profiles_update_self had no column restriction: any user could UPDATE
--       their own role (privilege escalation) or org_id (cross-org hop).
--       Fixed with column-level privileges: clients may update full_name only.
--       SECURITY DEFINER functions run as the table owner and are unaffected.
--   (B) tenant_financials() was callable by any authenticated user with any
--       tenant UUID (cross-org financial reads). It now verifies the caller's
--       org when a user JWT is present. Internal callers keep working:
--       record_payment / dashboard_tenants only reach it after their own org
--       checks (same org, so the guard passes), and service_role/postgres
--       sessions have auth.uid() IS NULL, which skips the guard.
--   (C) soft_delete_tenant() checked org but not role; caretakers could call
--       the RPC directly. It now requires an owner/admin.
-- =============================================================================

-- ---- 1. expand the role set -------------------------------------------------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'staff', 'caretaker', 'viewer'));

-- ---- 2. promote each org's earliest admin to owner ---------------------------
-- Idempotent: skips orgs that already have an owner. Deterministic tie-break on
-- (created_at, id) for the theoretical multi-admin org.
update profiles p
   set role = 'owner'
 where p.role = 'admin'
   and not exists (
     select 1 from profiles o where o.org_id = p.org_id and o.role = 'owner'
   )
   and p.id = (
     select p2.id from profiles p2
     where p2.org_id = p.org_id and p2.role = 'admin'
     order by p2.created_at, p2.id
     limit 1
   );

-- ---- 3. role helper functions ------------------------------------------------
-- Tiny named predicates so RLS policies stay readable. 'staff' is the legacy
-- name for caretaker-level access and keeps its exact current capabilities.
create or replace function rf_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select rf_role() = 'owner';
$$;

create or replace function rf_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select rf_role() in ('owner', 'admin');
$$;

create or replace function rf_can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select rf_role() in ('owner', 'admin', 'staff', 'caretaker');
$$;

revoke execute on function rf_is_owner(), rf_is_admin(), rf_can_write() from public, anon;
grant execute on function rf_is_owner(), rf_is_admin(), rf_can_write() to authenticated;

-- ---- 4. recreate admin-write policies with rf_is_admin() ---------------------
-- Same transaction as the promotion above: an owner is never locked out.
drop policy if exists units_insert on rental_units;
drop policy if exists units_update on rental_units;
drop policy if exists units_delete on rental_units;
create policy units_insert on rental_units
  for insert with check (org_id = rf_org_id() and rf_is_admin());
create policy units_update on rental_units
  for update using (org_id = rf_org_id() and rf_is_admin())
  with check (org_id = rf_org_id() and rf_is_admin());
create policy units_delete on rental_units
  for delete using (org_id = rf_org_id() and rf_is_admin());

drop policy if exists tenants_insert on tenants;
drop policy if exists tenants_update on tenants;
drop policy if exists tenants_delete on tenants;
create policy tenants_insert on tenants
  for insert with check (org_id = rf_org_id() and rf_is_admin());
create policy tenants_update on tenants
  for update using (org_id = rf_org_id() and rf_is_admin())
  with check (org_id = rf_org_id() and rf_is_admin());
create policy tenants_delete on tenants
  for delete using (org_id = rf_org_id() and rf_is_admin());

-- ---- 5. FIX (A): profiles column-level privileges -----------------------------
-- The profiles_update_self policy remains as the row filter (own row only);
-- these grants remove role/org_id from what any client can ever change.
revoke update on table profiles from authenticated, anon;
grant update (full_name) on table profiles to authenticated;

-- ---- 6. FIX (B): tenant_financials org check ----------------------------------
-- Body identical to the original except the authorization prologue.
create or replace function tenant_financials(p_tenant uuid, p_asof date default current_date)
returns table (
  balance       bigint,
  arrears       bigint,
  credit        bigint,
  covered_until date,
  overdue_days  int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant_org uuid;
  v_charged    bigint;
  v_paid       bigint;
  v_rent       bigint;
  v_base       date;
  v_extra      int;
  v_due        date;
begin
  -- Authorization: when called with a user JWT, the tenant must belong to the
  -- caller's org. service_role / postgres sessions (auth.uid() null) skip this,
  -- and internal callers (record_payment, dashboard_tenants) always match.
  select org_id into v_tenant_org from tenants where id = p_tenant;
  if v_tenant_org is null then
    raise exception 'tenant % not found', p_tenant;
  end if;
  if auth.uid() is not null
     and (rf_org_id() is null or rf_org_id() <> v_tenant_org) then
    raise exception 'not authorized for this tenant';
  end if;

  select coalesce(sum(amount_cents), 0) into v_charged from rent_charges where tenant_id = p_tenant;
  select coalesce(sum(amount_cents), 0) into v_paid    from payments     where tenant_id = p_tenant;
  select monthly_rent_cents into v_rent from tenants where id = p_tenant;

  balance := v_charged - v_paid;
  arrears := greatest(0, balance);
  credit  := greatest(0, -balance);

  -- Last month fully covered by FIFO: greatest period whose cumulative charge
  -- total is still <= total paid.
  select max(period_month) into v_base from (
    select period_month,
           sum(amount_cents) over (order by period_month, due_date, id) as cum
    from rent_charges where tenant_id = p_tenant
  ) t where cum <= v_paid;

  v_extra := case when credit > 0 and v_rent > 0 then floor(credit::numeric / v_rent)::int else 0 end;

  if v_extra > 0 then
    if v_base is not null then
      covered_until := (v_base + (v_extra || ' months')::interval)::date;
    else
      -- No charges yet (pure advance): current month plus (extra - 1) more.
      covered_until := (date_trunc('month', p_asof) + ((v_extra - 1) || ' months')::interval)::date;
    end if;
  else
    covered_until := v_base;
  end if;

  -- Overdue days: due date of the oldest charge not yet fully covered by FIFO.
  overdue_days := 0;
  if arrears > 0 then
    select due_date into v_due from (
      select period_month, due_date, id,
             sum(amount_cents) over (order by period_month, due_date, id) as cum
      from rent_charges where tenant_id = p_tenant
    ) t where t.cum > v_paid
    order by t.period_month, t.due_date, t.id
    limit 1;

    if v_due is not null and p_asof > v_due then
      overdue_days := (p_asof - v_due);
    end if;
  end if;

  return next;
end;
$$;

-- ---- 7. FIX (C): soft_delete_tenant requires owner/admin ----------------------
-- Body identical to the original except the role check.
create or replace function soft_delete_tenant(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_org uuid := rf_org_id();
  v_org        uuid;
begin
  select org_id into v_org from tenants where id = p_tenant;
  if v_org is null then
    raise exception 'tenant % not found', p_tenant;
  end if;
  if v_caller_org is null or v_caller_org <> v_org then
    raise exception 'not authorized for this tenant';
  end if;
  if not rf_is_admin() then
    raise exception 'only owners and admins can delete tenants';
  end if;

  update tenants
     set is_deleted = true,
         deleted_at = now(),
         status     = 'inactive',
         updated_at = now()
   where id = p_tenant;

  -- Take any un-sent receipts out of the worker's claim set. The worker only
  -- ever claims status in ('pending','retrying'); moving them to 'failed'
  -- guarantees it never sends them — no worker code change required.
  update sms_messages
     set status     = 'failed',
         error      = coalesce(error, 'canceled: tenant deleted'),
         locked_at  = null
   where tenant_id = p_tenant
     and status in ('pending', 'retrying');
end;
$$;

-- ---- 8. viewer gate for payments: thin wrapper, record_payment untouched ------
-- The frontend calls record_payment_checked; the direct grant on record_payment
-- is kept for now so an already-deployed frontend keeps working. A follow-up
-- hardening migration revokes it once the switch is verified in production.
create or replace function record_payment_checked(
  p_tenant  uuid,
  p_amount  bigint,
  p_method  text default 'cash',
  p_note    text default null,
  p_paid_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not rf_can_write() then
    raise exception 'read-only role cannot record payments';
  end if;
  return record_payment(p_tenant, p_amount, p_method, p_note, p_paid_at);
end;
$$;

revoke execute on function record_payment_checked(uuid, bigint, text, text, timestamptz) from public, anon;
grant execute on function record_payment_checked(uuid, bigint, text, text, timestamptz) to authenticated;
