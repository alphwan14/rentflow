-- =============================================================================
-- RentFlow functions — the server-authoritative, atomic write path.
--
-- The FIFO allocation RULE lives here (write side) and is mirrored exactly by
-- the tested TypeScript engine in src/lib/ledger (read/preview side). Both clear
-- the OLDEST unpaid rent first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers (read the caller's profile)
-- ---------------------------------------------------------------------------
create or replace function rf_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

create or replace function rf_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- ensure_charges — LAZY BACKFILL
-- Generate any missing monthly rent_charges (and their ledger entries) for a
-- tenant from move-in month through the target month. Rent amount + due day are
-- snapshotted from the tenant at generation time.
-- ---------------------------------------------------------------------------
create or replace function ensure_charges(p_tenant uuid, p_through date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org        uuid;
  v_rent       bigint;
  v_due_day    int;
  v_move_in    date;
  v_start      date;
  v_target     date;
  v_period     date;
  v_due_date   date;
  v_charge_id  uuid;
begin
  select org_id, monthly_rent_cents, due_day, move_in_date
    into v_org, v_rent, v_due_day, v_move_in
  from tenants where id = p_tenant;

  if v_org is null then
    raise exception 'tenant % not found', p_tenant;
  end if;

  v_start  := date_trunc('month', v_move_in)::date;
  v_target := date_trunc('month', p_through)::date;
  v_period := v_start;

  while v_period <= v_target loop
    if not exists (
      select 1 from rent_charges where tenant_id = p_tenant and period_month = v_period
    ) then
      -- Clamp the due day to the month's length (e.g. day 31 in February).
      v_due_date := v_period
        + (least(
             v_due_day,
             extract(day from (v_period + interval '1 month' - interval '1 day'))::int
           ) - 1);

      insert into rent_charges (org_id, tenant_id, period_month, amount_cents, due_date)
      values (v_org, p_tenant, v_period, v_rent, v_due_date)
      returning id into v_charge_id;

      insert into ledger_entries (org_id, tenant_id, entry_type, amount_cents, source_table, source_id, occurred_at)
      values (v_org, p_tenant, 'charge', v_rent, 'rent_charges', v_charge_id, v_due_date::timestamptz);
    end if;

    v_period := (v_period + interval '1 month')::date;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- recompute_allocations — rebuild the FIFO mapping for a tenant from scratch.
-- Deleting and rebuilding makes it robust to backdated charges/payments.
-- ---------------------------------------------------------------------------
create or replace function recompute_allocations(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org      uuid;
  pay        record;
  chg        record;
  pool       bigint;
  applied    bigint;
begin
  select org_id into v_org from tenants where id = p_tenant;
  delete from payment_allocations where tenant_id = p_tenant;

  create temp table _chg on commit drop as
    select id as charge_id, period_month, due_date, amount_cents as remaining
    from rent_charges where tenant_id = p_tenant;

  for pay in
    select id, amount_cents from payments where tenant_id = p_tenant order by paid_at, id
  loop
    pool := pay.amount_cents;

    loop
      exit when pool <= 0;
      select charge_id, remaining into chg
      from _chg where remaining > 0
      order by period_month, due_date, charge_id
      limit 1;
      exit when not found;

      applied := least(pool, chg.remaining);
      update _chg set remaining = remaining - applied where charge_id = chg.charge_id;

      insert into payment_allocations (org_id, tenant_id, payment_id, charge_id, amount_cents)
      values (v_org, p_tenant, pay.id, chg.charge_id, applied);

      pool := pool - applied;
    end loop;

    if pool > 0 then
      insert into payment_allocations (org_id, tenant_id, payment_id, charge_id, amount_cents)
      values (v_org, p_tenant, pay.id, null, pool);
    end if;
  end loop;

  drop table if exists _chg;
end;
$$;

-- ---------------------------------------------------------------------------
-- tenant_financials — derived state (balance, arrears, credit, covered_until).
-- Single SQL source mirrored by the TS deriveStatus(). Uses a running-sum
-- window over charges (FIFO) so it does not depend on stored allocations.
-- ---------------------------------------------------------------------------
create or replace function tenant_financials(p_tenant uuid, p_asof date default current_date)
returns table (
  balance       bigint,
  arrears       bigint,
  credit        bigint,
  covered_until date,
  overdue_days  int
) language plpgsql stable security definer set search_path = public as $$
declare
  v_charged    bigint;
  v_paid       bigint;
  v_rent       bigint;
  v_base       date;
  v_extra      int;
  v_due        date;
begin
  select coalesce(sum(amount_cents), 0) into v_charged from rent_charges where tenant_id = p_tenant;
  select coalesce(sum(amount_cents), 0) into v_paid    from payments     where tenant_id = p_tenant;
  select monthly_rent_cents into v_rent from tenants where id = p_tenant;

  balance := v_charged - v_paid;
  arrears := greatest(0, balance);
  credit  := greatest(0, -balance);

  -- Last month fully covered by FIFO: greatest period whose cumulative charge
  -- total is still <= total paid.
  select max(period_month) into v_base from (
    select period_month,
           sum(amount_cents) over (order by period_month, due_date, id) as cum
    from rent_charges where tenant_id = p_tenant
  ) t where cum <= v_paid;

  v_extra := case when credit > 0 and v_rent > 0 then floor(credit::numeric / v_rent)::int else 0 end;

  if v_extra > 0 then
    if v_base is not null then
      covered_until := (v_base + (v_extra || ' months')::interval)::date;
    else
      -- No charges yet (pure advance): current month plus (extra - 1) more.
      covered_until := (date_trunc('month', p_asof) + ((v_extra - 1) || ' months')::interval)::date;
    end if;
  else
    covered_until := v_base;
  end if;

  -- Overdue days: due date of the oldest charge not yet fully covered by FIFO.
  overdue_days := 0;
  if arrears > 0 then
    select due_date into v_due from (
      select period_month, due_date, id,
             sum(amount_cents) over (order by period_month, due_date, id) as cum
      from rent_charges where tenant_id = p_tenant
    ) t where t.cum > v_paid
    order by t.period_month, t.due_date, t.id
    limit 1;

    if v_due is not null and p_asof > v_due then
      overdue_days := (p_asof - v_due);
    end if;
  end if;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_payment — THE atomic payment write. Everything below happens in ONE
-- transaction: nothing can half-commit.
--   1. lazy-backfill charges through today
--   2. insert payment + its ledger entry
--   3. recompute FIFO allocations
--   4. atomically allocate a receipt number
--   5. snapshot + insert the receipt
--   6. enqueue the SMS receipt (outbox)
-- Returns the receipt + current derived financials.
-- ---------------------------------------------------------------------------
create or replace function record_payment(
  p_tenant  uuid,
  p_amount  bigint,
  p_method  text default 'cash',
  p_note    text default null,
  p_paid_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org        uuid;
  v_caller_org uuid;
  v_tenant     record;
  v_unit_label text;
  v_payment_id uuid;
  v_year       int;
  v_seq        bigint;
  v_receipt_no text;
  v_fin        record;
  v_covered    text;
  v_snapshot   jsonb;
  v_body       text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  select * into v_tenant from tenants where id = p_tenant;
  if v_tenant.id is null then
    raise exception 'tenant % not found', p_tenant;
  end if;
  v_org := v_tenant.org_id;

  -- Authorize: caller must belong to the same org. (admin & staff both record.)
  v_caller_org := rf_org_id();
  if v_caller_org is null or v_caller_org <> v_org then
    raise exception 'not authorized for this tenant';
  end if;

  select label into v_unit_label from rental_units where id = v_tenant.unit_id;

  -- 1. lazy backfill
  perform ensure_charges(p_tenant, p_paid_at::date);

  -- 2. payment + ledger entry
  insert into payments (org_id, tenant_id, amount_cents, method, note, paid_at, recorded_by)
  values (v_org, p_tenant, p_amount, coalesce(p_method, 'cash'), p_note, p_paid_at, auth.uid())
  returning id into v_payment_id;

  insert into ledger_entries (org_id, tenant_id, entry_type, amount_cents, source_table, source_id, occurred_at)
  values (v_org, p_tenant, 'payment', -p_amount, 'payments', v_payment_id, p_paid_at);

  -- 3. recompute allocations
  perform recompute_allocations(p_tenant);

  -- 4. atomic receipt number  RCP-YYYY-00001
  v_year := extract(year from p_paid_at)::int;
  insert into receipt_counters (org_id, year, last_seq)
  values (v_org, v_year, 1)
  on conflict (org_id, year) do update set last_seq = receipt_counters.last_seq + 1
  returning last_seq into v_seq;
  v_receipt_no := 'RCP-' || v_year || '-' || lpad(v_seq::text, 5, '0');

  -- 5. derived financials -> snapshot
  select * into v_fin from tenant_financials(p_tenant, p_paid_at::date);
  v_covered := case
    when v_fin.covered_until is not null then to_char(v_fin.covered_until, 'FMMonth YYYY')
    else null end;

  v_snapshot := jsonb_build_object(
    'receipt_no',    v_receipt_no,
    'tenant_name',   v_tenant.full_name,
    'unit',          v_unit_label,
    'amount_cents',  p_amount,
    'method',        coalesce(p_method, 'cash'),
    'paid_at',       p_paid_at,
    'balance_cents', v_fin.balance,
    'arrears_cents', v_fin.arrears,
    'credit_cents',  v_fin.credit,
    'covered_until', v_covered
  );

  insert into receipts (org_id, payment_id, receipt_no, snapshot)
  values (v_org, v_payment_id, v_receipt_no, v_snapshot);

  -- 6. enqueue SMS receipt (only if we have a phone)
  if v_tenant.phone is not null and length(trim(v_tenant.phone)) > 0 then
    v_body :=
      'RENTFLOW RECEIPT' || E'\n\n' ||
      'Payment received: KES ' || to_char(p_amount / 100.0, 'FM999,999,990') || E'\n' ||
      coalesce('Room: ' || v_unit_label || E'\n', '') ||
      'Tenant: ' || v_tenant.full_name || E'\n' ||
      'Receipt No: ' || v_receipt_no || E'\n' ||
      'Date: ' || to_char(p_paid_at, 'DD Mon YYYY') || E'\n' ||
      'Balance: KES ' || to_char(greatest(v_fin.arrears,0) / 100.0, 'FM999,999,990') || E'\n' ||
      coalesce('Covered Until: ' || v_covered || E'\n', '') ||
      E'\nThank you.';

    insert into sms_messages (org_id, tenant_id, payment_id, to_phone, body)
    values (v_org, p_tenant, v_payment_id, v_tenant.phone, v_body);
  end if;

  return jsonb_build_object(
    'payment_id',  v_payment_id,
    'receipt_no',  v_receipt_no,
    'snapshot',    v_snapshot,
    'balance',     v_fin.balance,
    'arrears',     v_fin.arrears,
    'credit',      v_fin.credit,
    'covered_until', v_covered
  );
end;
$$;
