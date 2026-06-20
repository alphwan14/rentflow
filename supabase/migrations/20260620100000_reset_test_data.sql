-- =============================================================================
-- ONE-TIME DATA RESET — clear all test data for a clean hand-over.
--
-- WHAT THIS DOES
--   Empties every business/financial table (tenants, units, charges, payments,
--   adjustments, ledger, allocations, receipts, SMS outbox) and resets receipt
--   numbering, so the first real receipt starts at RCP-YYYY-00001.
--
-- WHAT THIS DELIBERATELY KEEPS (so nothing breaks and no re-onboarding needed)
--   * orgs      — the account container
--   * profiles  — the login -> account link (admin/staff)
--   * auth.users — Supabase Auth (untouched; this file only touches `public`)
--   * the ENTIRE schema, functions, RLS policies — untouched (no logic changed)
--
-- SAFETY
--   Pure DML (TRUNCATE only). No schema/function/policy changes. On a fresh
--   database the tables are already empty, so this is a harmless no-op there.
--   CASCADE only follows foreign keys *into* the listed tables — and nothing
--   outside this set (orgs/profiles included) references them — so the account
--   and login are guaranteed to survive.
-- =============================================================================

truncate table
  payment_allocations,
  ledger_entries,
  receipts,
  sms_messages,
  payments,
  adjustments,
  rent_charges,
  tenants,
  rental_units,
  receipt_counters
restart identity cascade;
