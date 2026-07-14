-- =============================================================================
-- DEFERRED HARDENING — do not apply with the v1.1 release.
--
-- The v1.1 frontend records payments through record_payment_checked() (which
-- adds the viewer read-only gate). The direct grant on record_payment() was
-- intentionally KEPT during the transition so a previously-deployed frontend
-- can never hit a window where payments fail.
--
-- APPLY ONLY AFTER verifying in production that payments flow through
-- record_payment_checked (record a real payment on the deployed v1.1 app).
--
-- To apply: copy this file into supabase/migrations/ with a fresh timestamp
-- prefix, e.g. supabase/migrations/2026MMDDHHMMSS_harden_record_payment.sql,
-- then `supabase db push`.
--
-- Rollback (if ever needed):
--   grant execute on function record_payment(uuid, bigint, text, text, timestamptz) to authenticated;
-- =============================================================================

revoke execute on function record_payment(uuid, bigint, text, text, timestamptz)
  from public, anon, authenticated;
-- service_role and SECURITY DEFINER callers (record_payment_checked) are unaffected.
