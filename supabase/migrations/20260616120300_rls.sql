-- =============================================================================
-- Row Level Security.
--
-- Integrity model:
--   * Every table is org-scoped: you only ever see your own account's rows.
--   * Financial-truth tables (rent_charges, payments, adjustments,
--     ledger_entries, payment_allocations, receipts) have NO insert/update/
--     delete policies for users. They are APPEND-ONLY and written exclusively by
--     SECURITY DEFINER functions. With RLS enabled and no write policy, every
--     direct write from a user is denied — there is no way to edit a balance.
--   * Only tenants & rental_units are directly writable, and only by admins.
-- =============================================================================

alter table orgs                enable row level security;
alter table profiles            enable row level security;
alter table rental_units        enable row level security;
alter table tenants             enable row level security;
alter table rent_charges        enable row level security;
alter table payments            enable row level security;
alter table adjustments         enable row level security;
alter table ledger_entries      enable row level security;
alter table payment_allocations enable row level security;
alter table receipts            enable row level security;
alter table receipt_counters    enable row level security;
alter table sms_messages        enable row level security;

-- ---- orgs & profiles -------------------------------------------------------
create policy orgs_select on orgs
  for select using (id = rf_org_id());

create policy profiles_select on profiles
  for select using (org_id = rf_org_id());
create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- rental_units (admin writes) -------------------------------------------
create policy units_select on rental_units
  for select using (org_id = rf_org_id());
create policy units_insert on rental_units
  for insert with check (org_id = rf_org_id() and rf_role() = 'admin');
create policy units_update on rental_units
  for update using (org_id = rf_org_id() and rf_role() = 'admin')
  with check (org_id = rf_org_id() and rf_role() = 'admin');
create policy units_delete on rental_units
  for delete using (org_id = rf_org_id() and rf_role() = 'admin');

-- ---- tenants (admin writes) ------------------------------------------------
create policy tenants_select on tenants
  for select using (org_id = rf_org_id());
create policy tenants_insert on tenants
  for insert with check (org_id = rf_org_id() and rf_role() = 'admin');
create policy tenants_update on tenants
  for update using (org_id = rf_org_id() and rf_role() = 'admin')
  with check (org_id = rf_org_id() and rf_role() = 'admin');
create policy tenants_delete on tenants
  for delete using (org_id = rf_org_id() and rf_role() = 'admin');

-- ---- financial truth (READ-ONLY for users; written via functions) ----------
create policy charges_select on rent_charges
  for select using (org_id = rf_org_id());
create policy payments_select on payments
  for select using (org_id = rf_org_id());
create policy adjustments_select on adjustments
  for select using (org_id = rf_org_id());
create policy ledger_select on ledger_entries
  for select using (org_id = rf_org_id());
create policy allocations_select on payment_allocations
  for select using (org_id = rf_org_id());
create policy receipts_select on receipts
  for select using (org_id = rf_org_id());
create policy sms_select on sms_messages
  for select using (org_id = rf_org_id());

-- receipt_counters: internal only — no policies => no direct access.
-- (SECURITY DEFINER functions bypass RLS for the atomic increment.)
