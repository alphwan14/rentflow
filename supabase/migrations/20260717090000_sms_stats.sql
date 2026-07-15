-- =============================================================================
-- SMS Diagnostics: read-only aggregates for the operational dashboard.
--
-- ADDITIVE & ZERO-RISK: one new STABLE function that only ever SELECTs from
-- sms_messages, scoped to the caller's org via rf_org_id(). No table, column,
-- trigger, financial function or worker function is touched.
--
-- Timing model (durable timestamps on sms_messages):
--   created_at   payment/receipt/enqueue commit in one transaction
--   sent_at      the SMS gateway accepted the message
--   delivered_at the recipient's network confirmed handset delivery
-- (locked_at is cleared on settlement, so claim latency is only observable on
--  in-flight rows — accept time below therefore covers queue wait + send.)
-- =============================================================================

create or replace function sms_stats(p_days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today',            count(*) filter (where created_at >= date_trunc('day', now())),
    'window_days',      p_days,
    'total',            count(*),
    'delivered',        count(*) filter (where status = 'delivered'),
    'sent_awaiting',    count(*) filter (where status = 'sent'),
    'in_queue',         count(*) filter (where status in ('pending', 'sending', 'retrying')),
    'failed',           count(*) filter (where status = 'failed'),
    'retried',          count(*) filter (where attempts > 1),
    -- Of the messages that reached a terminal-ish outcome, how many got out?
    'success_rate',     case
                          when count(*) filter (where status in ('delivered', 'sent', 'failed')) > 0
                          then round(
                            100.0 * count(*) filter (where status in ('delivered', 'sent'))
                            / count(*) filter (where status in ('delivered', 'sent', 'failed'))
                          )
                        end,
    'avg_accept_secs',  round(avg(extract(epoch from (sent_at - created_at)))
                          filter (where sent_at is not null)),
    'avg_confirm_secs', round(avg(extract(epoch from (delivered_at - sent_at)))
                          filter (where delivered_at is not null and sent_at is not null)),
    'avg_total_secs',   round(avg(extract(epoch from (delivered_at - created_at)))
                          filter (where delivered_at is not null))
  )
  from sms_messages
  where org_id = rf_org_id()
    and created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)));
$$;

revoke execute on function sms_stats(int) from public, anon;
grant execute on function sms_stats(int) to authenticated;
