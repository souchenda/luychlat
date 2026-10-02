-- ===========================================================================
-- Step B: Bakong KHQR checkout with instant PRO.
--
-- The app server builds a dynamic KHQR (exact amount, bill number, 15-min
-- expiry), stores it here, and polls Bakong with its MD5. When Bakong reports
-- the transaction, the server confirms it and PRO is extended in the same
-- database transaction. Only the server (service_role key, never in the
-- browser) can create, confirm or expire KHQR payments, so a user can never
-- mark their own payment paid. The amount always comes from public.plans.
-- Idempotent: safe to re-run.
-- ===========================================================================

alter table public.payments
  add column if not exists khqr        text,
  add column if not exists bill_number text,
  add column if not exists expires_at  timestamptz,
  add column if not exists sandbox     boolean not null default false,
  add column if not exists payer_account text;
alter table public.payments
  drop constraint if exists payments_khqr_length,
  add constraint payments_khqr_length check (khqr is null or char_length(khqr) <= 512),
  drop constraint if exists payments_payer_account_length,
  add constraint payments_payer_account_length check (payer_account is null or char_length(payer_account) <= 64);
create unique index if not exists payments_bill_number_key on public.payments (bill_number) where bill_number is not null;
create unique index if not exists payments_bakong_md5_key on public.payments (bakong_md5) where bakong_md5 is not null;
-- One Bakong transaction can activate only one payment.
create unique index if not exists payments_bakong_hash_key on public.payments (bakong_hash) where bakong_hash is not null;

-- ---------------------------------------------------------------------------
-- Create (server only). Older open KHQRs of the same user are expired first,
-- so at most one QR is live per user. 10 per hour per user.
-- ---------------------------------------------------------------------------
create or replace function public.khqr_create_payment(
  p_user_id uuid, p_plan_code text, p_currency public.currency_code, p_bill_number text,
  p_md5 text, p_qr text, p_expires_at timestamptz, p_sandbox boolean
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  result public.payments;
begin
  select * into plan from public.plans where code = p_plan_code and tier = 'PRO' and active;
  if not found then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_md5 !~ '^[0-9a-f]{32}$' or p_bill_number !~ '^[A-Za-z0-9]{6,25}$' or p_expires_at <= now() then
    raise exception 'invalid khqr' using errcode = '22023';
  end if;
  if (select count(*) from public.payments
      where user_id = p_user_id and method = 'KHQR' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_qr' using errcode = 'P0001';
  end if;

  update public.payments set status = 'EXPIRED'
  where user_id = p_user_id and method = 'KHQR' and status = 'PENDING';

  insert into public.payments (user_id, plan_code, amount, currency, method, reference, status, bakong_md5, khqr, bill_number, expires_at, sandbox)
  values (
    p_user_id, plan.code, case when p_currency = 'USD' then plan.price_usd else plan.price_khr end, p_currency,
    'KHQR', p_bill_number, 'PENDING', p_md5, p_qr, p_bill_number, p_expires_at, coalesce(p_sandbox, false)
  )
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirm (server only), after Bakong reported the transaction. Checks the
-- amount and currency again, then PAID + PRO extension + event, atomically.
-- Idempotent: confirming a PAID payment again just returns it. A payment
-- that expired in our system can still be confirmed (the user paid in time
-- per Bakong, or scanned just before expiry).
-- ---------------------------------------------------------------------------
create or replace function public.khqr_confirm_payment(
  p_payment_id uuid, p_hash text, p_amount numeric, p_currency public.currency_code, p_payer_account text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  plan public.plans;
  sub public.subscriptions;
begin
  select * into pay from public.payments where id = p_payment_id and method = 'KHQR' for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if pay.status = 'PAID' then
    return jsonb_build_object('status', 'PAID', 'already', true,
      'period_end', (select current_period_end from public.subscriptions where user_id = pay.user_id));
  end if;
  if pay.status not in ('PENDING', 'EXPIRED') then
    raise exception 'payment is %', pay.status using errcode = 'P0001';
  end if;
  if p_amount is distinct from pay.amount or p_currency is distinct from pay.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  if p_hash is null or char_length(p_hash) > 128 then
    raise exception 'invalid hash' using errcode = '22023';
  end if;

  select * into plan from public.plans where code = pay.plan_code;
  begin
    update public.payments
    set status = 'PAID', bakong_hash = p_hash, payer_account = left(p_payer_account, 64), reviewed_at = now(),
        note = left(coalesce(nullif(p_note, ''), case when pay.sandbox then 'KHQR sandbox' else 'KHQR' end), 500)
    where id = pay.id;
  exception when unique_violation then
    raise exception 'hash_already_used' using errcode = 'P0001';
  end;
  sub := public.extend_subscription(
    pay.user_id, pay.plan_code, plan.period_days, 'KHQR', null,
    case when pay.sandbox then 'KHQR sandbox ' else 'KHQR ' end || pay.bill_number, pay.id
  );
  return jsonb_build_object('status', 'PAID', 'already', false, 'period_end', sub.current_period_end, 'plan_code', sub.plan_code);
end;
$$;

-- Expire (server only): only an unpaid KHQR past its expiry.
create or replace function public.khqr_expire_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.payments;
begin
  update public.payments set status = 'EXPIRED'
  where id = p_payment_id and method = 'KHQR' and status = 'PENDING' and expires_at <= now()
  returning * into result;
  if result.id is null then
    select * into result from public.payments where id = p_payment_id;
  end if;
  return result;
end;
$$;

-- Admin numbers: sandbox payments aren't revenue, and open QRs aren't
-- waiting for a manual review. Supersedes 20261001100000_subscriptions.sql.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  with activity as (
    select u.id, public.last_active_at(u.id) as last_active,
      exists (select 1 from public.subscriptions s where s.user_id = u.id and s.status = 'ACTIVE' and s.current_period_end > now()) as pro
    from auth.users u
  )
  select jsonb_build_object(
    'users', count(*),
    'dau', count(*) filter (where last_active > now() - interval '24 hours'),
    'mau', count(*) filter (where last_active > now() - interval '30 days'),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'pro_active', count(*) filter (where pro),
    'free_users', count(*) filter (where not pro),
    'expiring_7d', (select count(*) from public.subscriptions where status = 'ACTIVE' and current_period_end > now() and current_period_end <= now() + interval '7 days'),
    'pending_payments', (select count(*) from public.payments where status = 'PENDING' and method <> 'KHQR'),
    'paid_30d_usd', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and not sandbox and currency = 'USD' and reviewed_at > now() - interval '30 days'),
    'paid_30d_khr', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and not sandbox and currency = 'KHR' and reviewed_at > now() - interval '30 days')
  )
  into result
  from activity;
  return result;
end;
$$;

revoke all on function public.khqr_create_payment(uuid, text, public.currency_code, text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.khqr_confirm_payment(uuid, text, numeric, public.currency_code, text, text) from public, anon, authenticated;
revoke all on function public.khqr_expire_payment(uuid) from public, anon, authenticated;
grant execute on function public.khqr_create_payment(uuid, text, public.currency_code, text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.khqr_confirm_payment(uuid, text, numeric, public.currency_code, text, text) to service_role;
grant execute on function public.khqr_expire_payment(uuid) to service_role;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
