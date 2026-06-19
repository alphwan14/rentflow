-- =============================================================================
-- Production SMS hardening:
--   1. add a real 'delivered' state + delivery-report columns
--   2. normalize phone numbers to E.164 BEFORE they enter the queue
-- Financial/ledger logic is unchanged — only the SMS-enqueue line of
-- record_payment is touched (to normalize the recipient).
-- =============================================================================

-- ---- delivery state --------------------------------------------------------
alter table sms_messages drop constraint if exists sms_messages_status_check;
alter table sms_messages
  add constraint sms_messages_status_check
  check (status in ('pending', 'sending', 'sent', 'retrying', 'delivered', 'failed'));

alter table sms_messages
  add column if not exists delivered_at    timestamptz,
  add column if not exists delivery_report jsonb;

comment on column sms_messages.delivered_at is 'Set when AT delivery report confirms handset delivery.';

-- ---- E.164 normalization (authoritative, used at enqueue) -------------------
-- Kenyan MSISDN -> +2547XXXXXXXX / +2541XXXXXXXX. Best-effort: unrecognized
-- input is returned cleaned (digits/+) so the provider can still warn.
create or replace function normalize_ke_phone(p_phone text)
returns text language plpgsql immutable as $$
declare
  v text;
begin
  if p_phone is null then
    return null;
  end if;
  v := regexp_replace(p_phone, '[^0-9+]', '', 'g'); -- strip spaces/dashes/parens
  if v ~ '^\+254[17][0-9]{8}$' then return v; end if;            -- +2547xxxxxxxx
  if v ~ '^254[17][0-9]{8}$'  then return '+' || v; end if;       -- 2547xxxxxxxx
  if v ~ '^0[17][0-9]{8}$'    then return '+254' || substring(v from 2); end if; -- 07xxxxxxxx
  if v ~ '^[17][0-9]{8}$'     then return '+254' || v; end if;    -- 7xxxxxxxx
  return v; -- unrecognized; best effort
end;
$$;

-- ---- record_payment: normalize the recipient at enqueue --------------------
-- Identical to the prior version except the SMS row now stores the E.164 phone.
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
  v_phone      text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  select * into v_tenant from tenants where id = p_tenant;
  if v_tenant.id is null then
    raise exception 'tenant % not found', p_tenant;
  end if;
  v_org := v_tenant.org_id;

  v_caller_org := rf_org_id();
  if v_caller_org is null or v_caller_org <> v_org then
    raise exception 'not authorized for this tenant';
  end if;

  select label into v_unit_label from rental_units where id = v_tenant.unit_id;

  perform ensure_charges(p_tenant, p_paid_at::date);

  insert into payments (org_id, tenant_id, amount_cents, method, note, paid_at, recorded_by)
  values (v_org, p_tenant, p_amount, coalesce(p_method, 'cash'), p_note, p_paid_at, auth.uid())
  returning id into v_payment_id;

  insert into ledger_entries (org_id, tenant_id, entry_type, amount_cents, source_table, source_id, occurred_at)
  values (v_org, p_tenant, 'payment', -p_amount, 'payments', v_payment_id, p_paid_at);

  perform recompute_allocations(p_tenant);

  v_year := extract(year from p_paid_at)::int;
  insert into receipt_counters (org_id, year, last_seq)
  values (v_org, v_year, 1)
  on conflict (org_id, year) do update set last_seq = receipt_counters.last_seq + 1
  returning last_seq into v_seq;
  v_receipt_no := 'RCP-' || v_year || '-' || lpad(v_seq::text, 5, '0');

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

  -- enqueue SMS receipt with a NORMALIZED E.164 recipient
  v_phone := normalize_ke_phone(v_tenant.phone);
  if v_phone is not null and length(trim(v_phone)) > 0 then
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
    values (v_org, p_tenant, v_payment_id, v_phone, v_body);
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
