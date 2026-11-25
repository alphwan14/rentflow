-- RentFlow v2 — scheduled jobs (pg_cron) and live updates (Realtime).

-- Matched payments appear on the landlord's screen without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payment_events, public.payments;
  end if;
end $$;

-- Rent is billed by a daily, idempotent run (00:05 Nairobi = 21:05 UTC) so a
-- missed night never skips a month. Late fees run after it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rentflow-monthly-charges', '5 21 * * *', 'select public.run_monthly_charges()');
    perform cron.schedule('rentflow-late-fees', '35 21 * * *', 'select public.apply_late_fees()');
  end if;
end $$;
