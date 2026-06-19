-- =============================================================================
-- Read-side helpers for the dashboard.
-- =============================================================================

-- Backfill charges + refresh allocations for every active tenant in the caller's
-- org. Cheap at single-landlord scale; call on dashboard load.
create or replace function sync_org_charges()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := rf_org_id();
  t     record;
begin
  if v_org is null then
    return;
  end if;
  for t in select id from tenants where org_id = v_org and status <> 'inactive' loop
    perform ensure_charges(t.id, current_date);
    perform recompute_allocations(t.id);
  end loop;
end;
$$;

-- One row per tenant with current derived financials, for the dashboard list.
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
  order by
    case when f.arrears > 0 then 0 else 1 end,  -- owers first
    t.full_name;
$$;

grant execute on function sync_org_charges() to authenticated;
grant execute on function dashboard_tenants() to authenticated;
