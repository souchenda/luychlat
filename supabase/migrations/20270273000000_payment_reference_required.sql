-- A payment request carries its proof (founder, 28/10/2026 — the first customer tapped «I've paid» without paying; she
-- had taken the app for a bank app). A transfer or a KHQR payment is sent with its transaction code — at least 4 letters
-- or digits (lib/payment-proof.ts) — so the approver can find it in the bank before approving. Nothing is granted
-- here: PRO still opens only on an approver's tap (admin_review_payment). Same signature: the app is unchanged.
create or replace function public.request_upgrade(p_plan_code text, p_method text, p_reference text, p_currency public.currency_code)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.plans;
  result public.payments;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- PRO and ULTRA (the live definition since 20261103000000_growth_controls — kept).
  select * into p from public.plans where code = p_plan_code and tier in ('PRO', 'ULTRA') and active;
  if not found then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_method not in ('BANK_TRANSFER', 'KHQR', 'CASH', 'OTHER') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;
  if p_method in ('BANK_TRANSFER', 'KHQR') and length(regexp_replace(coalesce(p_reference, ''), '[^0-9A-Za-z]', '', 'g')) < 4 then
    raise exception 'reference_required' using errcode = 'P0001';
  end if;
  if (select count(*) from public.payments where user_id = uid and status = 'PENDING') >= 3 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;
  insert into public.payments (user_id, plan_code, amount, currency, method, reference)
  values (
    uid, p.code, case when p_currency = 'USD' then p.price_usd else p.price_khr end, p_currency, p_method,
    nullif(left(trim(coalesce(p_reference, '')), 120), '')
  )
  returning * into result;
  insert into public.subscription_events (user_id, kind, plan_code, payment_id, actor)
  values (uid, 'REQUESTED', p.code, result.id, uid);
  return result;
end;
$$;
