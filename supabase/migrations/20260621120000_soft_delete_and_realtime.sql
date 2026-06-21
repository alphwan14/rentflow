-- =============================================================================
-- Soft delete for tenants + realtime for the SMS status UI.
--
-- ADDITIVE & BACKWARD-COMPATIBLE:
--   * New columns default to "not deleted", so every existing tenant is
--     unaffected and keeps showing exactly as before.
--   * The SMS worker, claim_sms_batch, reap_stuck_sms and record_payment are
--     NOT touched. Deleted tenants are kept out of the pipeline two ways:
--       (a) they're excluded from the UI/charge sweep, so no NEW payment (and
--           therefore no new SMS) can be enqueued for them;
--       (b) their not-yet-sent SMS are moved out of the worker's claim set
--           (pending/retrying -> failed), so the worker simply never sees them.
--     No worker code changes; the claim query already only touches
--     status in ('pending','retrying').
-- =============================================================================

-- ---- soft-delete columns ---------------------------------------------------
alter table tenants
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

comment on column tenants.is_deleted is 'Soft delete: true hides the tenant from UI and the charge/SMS pipeline. History is retained.';

-- Most queries want only live tenants; a partial index keeps those fast.
create index if not exists tenants_live_idx on tenants (org_id) where not is_deleted;

-- ---- exclude deleted tenants from the dashboard list ------------------------
-- Identical to the original except the `and not t.is_deleted` filter.
create or replace function dashboard_tenants()
returns table (
  tenant_id          uuid,
  full_name          text,
  unit_label         text,
  phone              text,
  monthly_rent_cents bigint,
  status             text,
  balance            bigint,
  arrears            bigint,
  credit             bigint,
  covered_until      date,
  overdue_days       int
) language sql stable security definer set search_path = public as $$
  select
    t.id,
    t.full_name,
    u.label,
    t.phone,
    t.monthly_rent_cents,
    t.status,
    f.balance,
    f.arrears,
    f.credit,
    f.covered_until,
    f.overdue_days
  from tenants t
  left join rental_units u on u.id = t.unit_id
  cross join lateral tenant_financials(t.id, current_date) f
  where t.org_id = rf_org_id()
    and not t.is_deleted
  order by
    case when f.arrears > 0 then 0 else 1 end,  -- owers first
    t.full_name;
$$;

-- ---- exclude deleted tenants from the charge sweep --------------------------
-- Identical to the original except the `and not is_deleted` filter.
create or replace function sync_org_charges()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := rf_org_id();
  t     record;
begin
  if v_org is null then
    return;
  end if;
  for t in
    select id from tenants
    where org_id = v_org and status <> 'inactive' and not is_deleted
  loop
    perform ensure_charges(t.id, current_date);
    perform recompute_allocations(t.id);
  end loop;
end;
$$;

-- ---- soft-delete RPC -------------------------------------------------------
-- Marks the tenant deleted AND cancels its not-yet-sent SMS in one transaction.
-- Org-scoped (rf_org_id); admin-gating is enforced in the server action.
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

revoke execute on function soft_delete_tenant(uuid) from public, anon;
grant execute on function soft_delete_tenant(uuid) to authenticated;

-- ---- realtime for the SMS status UI ----------------------------------------
-- FULL replica identity so RLS can be evaluated on UPDATE/DELETE events and the
-- subscriber receives the changed row. Then add the table to Supabase's
-- realtime publication (idempotent; no-op if already present or unavailable).
alter table sms_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sms_messages'
     ) then
    alter publication supabase_realtime add table sms_messages;
  end if;
end $$;
