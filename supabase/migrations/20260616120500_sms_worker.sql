-- =============================================================================
-- SMS outbox -> reliable delivery. Adds operational columns + a safe queue
-- claim (FOR UPDATE SKIP LOCKED) and a crash reaper.
--
-- Additive only: the existing record_payment enqueue (org_id, tenant_id,
-- payment_id, to_phone, body) keeps working — new columns default sensibly.
-- The worker authenticates with the service-role key (bypasses RLS); it only
-- ever touches sms_messages, never financial tables.
-- =============================================================================

-- Expand status set: pending -> sending -> sent | retrying -> ... | failed
alter table sms_messages drop constraint if exists sms_messages_status_check;
alter table sms_messages
  add constraint sms_messages_status_check
  check (status in ('pending', 'sending', 'sent', 'retrying', 'failed'));

alter table sms_messages
  add column if not exists attempts             int not null default 0,
  add column if not exists max_attempts         int not null default 6,
  add column if not exists next_attempt_at      timestamptz,
  add column if not exists locked_at            timestamptz,
  add column if not exists provider_message_id  text,
  add column if not exists provider_response    jsonb;

-- Queue scan index: ready work ordered by age.
create index if not exists sms_messages_ready_idx
  on sms_messages (status, next_attempt_at, created_at);

-- ---------------------------------------------------------------------------
-- claim_sms_batch — atomically reserve up to p_limit due messages.
-- FOR UPDATE SKIP LOCKED guarantees no two workers/ticks grab the same row.
-- ---------------------------------------------------------------------------
create or replace function claim_sms_batch(p_limit int default 20)
returns setof sms_messages
language sql volatile security definer set search_path = public as $$
  update sms_messages m
  set status = 'sending', locked_at = now()
  where m.id in (
    select id from sms_messages
    where status in ('pending', 'retrying')
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at
    for update skip locked
    limit greatest(1, p_limit)
  )
  returning m.*;
$$;

-- ---------------------------------------------------------------------------
-- reap_stuck_sms — recover rows whose worker crashed mid-send. Anything left
-- in 'sending' past the visibility timeout goes back to 'retrying'.
-- ---------------------------------------------------------------------------
create or replace function reap_stuck_sms(p_timeout_seconds int default 120)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count int;
begin
  update sms_messages
  set status = 'retrying', locked_at = null
  where status = 'sending'
    and locked_at is not null
    and locked_at < now() - make_interval(secs => p_timeout_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the service role (the worker) runs these; keep them off the public API.
revoke execute on function claim_sms_batch(int) from public, authenticated, anon;
revoke execute on function reap_stuck_sms(int) from public, authenticated, anon;
grant execute on function claim_sms_batch(int) to service_role;
grant execute on function reap_stuck_sms(int) to service_role;
