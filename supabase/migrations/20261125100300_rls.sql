-- RentFlow v2 — row-level security on every table.
--
-- Reading: any member of the org (viewer and up).
-- Writing property data: owners and managers, directly through RLS.
-- Writing money (charges, payments, ledger, events, rules): never directly,
-- only through the SECURITY DEFINER functions, which check roles themselves.

do $$
declare t text;
begin
  foreach t in array array['profiles', 'orgs', 'members', 'org_invites', 'platform_admins', 'buildings', 'payout_channels',
                           'units', 'tenants', 'tenant_phones', 'leases', 'charges', 'statement_uploads', 'payment_events',
                           'payments', 'ledger_entries', 'match_rules', 'messages', 'jobs', 'audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Start from nothing for API roles; grant back only what policies allow.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- ── People ────────────────────────────────────────────────────────────────
create policy profiles_read on public.profiles for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.members me join public.members them on them.org_id = me.org_id
     where me.user_id = auth.uid() and them.user_id = profiles.user_id)
);
grant update (full_name, phone) on public.profiles to authenticated;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy orgs_read on public.orgs for select to authenticated using (public.is_member(id));
-- Owners may rename; the plan is set by RentFlow (set_org_plan).
grant update (name) on public.orgs to authenticated;
create policy orgs_update on public.orgs for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy members_read on public.members for select to authenticated using (public.is_member(org_id));
create policy invites_read on public.org_invites for select to authenticated using (public.can_manage(org_id));
create policy platform_admins_read on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- ── Property: managers write directly ─────────────────────────────────────
grant insert, update on public.buildings, public.payout_channels, public.units, public.tenants,
  public.tenant_phones, public.leases to authenticated;
grant delete on public.payout_channels, public.tenant_phones to authenticated;

create policy buildings_read on public.buildings for select to authenticated using (public.is_member(org_id));
-- New buildings go through create_building (plan checks), so no insert policy.
create policy buildings_update on public.buildings for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));

create policy channels_read on public.payout_channels for select to authenticated using (public.is_member(org_id));
create policy channels_insert on public.payout_channels for insert to authenticated with check (public.can_manage(org_id));
create policy channels_update on public.payout_channels for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));
create policy channels_delete on public.payout_channels for delete to authenticated using (public.can_manage(org_id));

create policy units_read on public.units for select to authenticated using (public.is_member(org_id));
-- Units are added through create_building / add_units (plan checks).
create policy units_update on public.units for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));

create policy tenants_read on public.tenants for select to authenticated using (public.is_member(org_id));
create policy tenants_insert on public.tenants for insert to authenticated with check (public.can_manage(org_id));
create policy tenants_update on public.tenants for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));

create policy phones_read on public.tenant_phones for select to authenticated using (public.is_member(org_id));
create policy phones_insert on public.tenant_phones for insert to authenticated with check (public.can_manage(org_id));
create policy phones_update on public.tenant_phones for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));
create policy phones_delete on public.tenant_phones for delete to authenticated using (public.can_manage(org_id));

create policy leases_read on public.leases for select to authenticated using (public.is_member(org_id));
create policy leases_insert on public.leases for insert to authenticated with check (public.can_manage(org_id));
create policy leases_update on public.leases for update to authenticated
  using (public.can_manage(org_id)) with check (public.can_manage(org_id));

-- ── Money: read-only through the API ──────────────────────────────────────
create policy charges_read on public.charges for select to authenticated using (public.is_member(org_id));
create policy uploads_read on public.statement_uploads for select to authenticated using (public.is_member(org_id));
create policy events_read on public.payment_events for select to authenticated using (public.is_member(org_id));
create policy payments_read on public.payments for select to authenticated using (public.is_member(org_id));
create policy ledger_read on public.ledger_entries for select to authenticated using (public.is_member(org_id));
create policy rules_read on public.match_rules for select to authenticated using (public.is_member(org_id));
create policy messages_read on public.messages for select to authenticated using (public.is_member(org_id));
create policy audit_read on public.audit_log for select to authenticated using (public.can_manage(org_id));
-- jobs: no policy → invisible to API users; the worker uses the service role.
revoke select on public.jobs from authenticated;

-- ── Functions: internal ones are not callable through the API ─────────────
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public._post_charge(uuid, public.charge_kind, date, date, bigint, text, uuid)',
    'public._post_payment(uuid, jsonb, text, numeric, uuid)',
    'public._learn_rules(uuid, jsonb, uuid)',
    'public._assert_unit_capacity(uuid, int)',
    'public._assert_building_capacity(uuid)',
    'public.generate_rent_charges(uuid, date)',
    'public.run_monthly_charges(date)',
    'public.apply_late_fees(date)',
    'public.enqueue_job(text, uuid, jsonb, timestamptz)',
    'public.claim_jobs(text, int)',
    'public.complete_job(bigint)',
    'public.fail_job(bigint, text)',
    'public.handle_new_user()',
    'public.audit_row()',
    'public.enqueue_live_event()',
    'public.forbid_mutation()',
    'public.guard_payment_update()'
  ] loop
    execute format('revoke execute on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
