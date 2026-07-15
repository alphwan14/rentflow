-- =============================================================================
-- Navigation performance: throttle the org-wide charge sweep.
--
-- WHY: the dashboard and tenants pages ran sync_org_charges() on EVERY page
-- load. That function loops every tenant through ensure_charges +
-- recompute_allocations — the heaviest work in the app — yet its output only
-- changes when a calendar month rolls over (per-tenant changes are already
-- handled at their source: record_payment and tenant creation both sync the
-- affected tenant directly).
--
-- This adds a tiny per-org "last swept" mark and a wrapper that runs the sweep
-- at most once per org per day. The first page load of the day pays the sweep;
-- every other navigation skips straight to reads.
--
-- ADDITIVE: sync_org_charges, ensure_charges and recompute_allocations are
-- untouched; the wrapper simply decides whether to call the existing function.
-- Race-safe: the conditional UPDATE takes a row lock, so two concurrent
-- requests can't both run the sweep.
-- =============================================================================

create table org_charge_sync (
  org_id    uuid primary key references orgs (id) on delete cascade,
  synced_on date not null
);

-- Internal bookkeeping only: RLS on with no policies = no direct client access.
alter table org_charge_sync enable row level security;

create or replace function sync_org_charges_if_stale()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := rf_org_id();
begin
  if v_org is null then
    return false;
  end if;

  -- Claim today's sweep. If another request already synced today, the WHERE
  -- clause makes this a no-op and FOUND is false.
  insert into org_charge_sync (org_id, synced_on)
  values (v_org, current_date)
  on conflict (org_id) do update
    set synced_on = excluded.synced_on
    where org_charge_sync.synced_on < excluded.synced_on;

  if found then
    perform sync_org_charges();
    return true;
  end if;
  return false;
end;
$$;

revoke execute on function sync_org_charges_if_stale() from public, anon;
grant execute on function sync_org_charges_if_stale() to authenticated;
