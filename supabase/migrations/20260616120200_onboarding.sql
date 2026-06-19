-- =============================================================================
-- Onboarding & sync helpers exposed to the app.
-- =============================================================================

-- Create an org + admin profile for the currently signed-in user. Idempotent-ish:
-- errors if the user already has a profile.
create or replace function bootstrap_account(p_org_name text, p_full_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'account already set up';
  end if;

  insert into orgs (name) values (coalesce(nullif(trim(p_org_name), ''), 'My Properties'))
  returning id into v_org;

  insert into profiles (id, org_id, full_name, role)
  values (v_uid, v_org, p_full_name, 'admin');

  return jsonb_build_object('org_id', v_org, 'role', 'admin');
end;
$$;

-- Keep a tenant's charges current (lazy backfill) and refresh allocations.
-- Safe to call on every tenant/dashboard load. Org-scoped.
create or replace function sync_charges(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select org_id into v_org from tenants where id = p_tenant;
  if v_org is null or v_org <> rf_org_id() then
    raise exception 'not authorized for this tenant';
  end if;
  perform ensure_charges(p_tenant, current_date);
  perform recompute_allocations(p_tenant);
end;
$$;

-- Lock down execute privileges. Internal functions stay private; only the
-- intended entrypoints are callable by signed-in users.
revoke execute on function ensure_charges(uuid, date) from public;
revoke execute on function recompute_allocations(uuid) from public;

grant execute on function bootstrap_account(text, text) to authenticated;
grant execute on function sync_charges(uuid) to authenticated;
grant execute on function record_payment(uuid, bigint, text, text, timestamptz) to authenticated;
grant execute on function tenant_financials(uuid, date) to authenticated;
grant execute on function rf_org_id() to authenticated;
grant execute on function rf_role() to authenticated;
