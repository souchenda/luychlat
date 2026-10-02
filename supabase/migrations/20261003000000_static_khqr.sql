-- ===========================================================================
-- Static KHQR payment (replaces the dynamic Bakong Open API checkout).
--
-- The admin uploads the shop's static KHQR image (e.g. from the ABA app).
-- Get PRO shows it with the exact amount to enter; the user pays, taps
-- "I have paid" (a PENDING payment via request_upgrade), sends the slip on
-- Telegram, and the admin approves in /admin. No external API.
--
-- Also removes what the short-lived dynamic version (same date) created, in
-- case it was applied. Idempotent: safe to re-run.
-- ===========================================================================

drop function if exists public.khqr_create_payment(uuid, text, public.currency_code, text, text, text, timestamptz, boolean);
drop function if exists public.khqr_confirm_payment(uuid, text, numeric, public.currency_code, text, text);
drop function if exists public.khqr_expire_payment(uuid);
drop index if exists public.payments_bill_number_key;
drop index if exists public.payments_bakong_md5_key;
drop index if exists public.payments_bakong_hash_key;
alter table public.payments
  drop constraint if exists payments_khqr_length,
  drop constraint if exists payments_payer_account_length,
  drop column if exists khqr,
  drop column if exists bill_number,
  drop column if exists expires_at,
  drop column if exists sandbox,
  drop column if exists payer_account;

-- Admin numbers as in 20261001100000 (every pending payment needs a review again).
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
    'pending_payments', (select count(*) from public.payments where status = 'PENDING'),
    'paid_30d_usd', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and currency = 'USD' and reviewed_at > now() - interval '30 days'),
    'paid_30d_khr', (select coalesce(sum(amount), 0) from public.payments where status = 'PAID' and currency = 'KHR' and reviewed_at > now() - interval '30 days')
  )
  into result
  from activity;
  return result;
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- The KHQR image: public bucket (anyone may view it, like a printed QR at a
-- shop counter); only admins upload, replace or delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_qr_admin_insert on storage.objects;
create policy payment_qr_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'payment-qr' and public.is_admin());
drop policy if exists payment_qr_admin_update on storage.objects;
create policy payment_qr_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'payment-qr' and public.is_admin()) with check (bucket_id = 'payment-qr' and public.is_admin());
drop policy if exists payment_qr_admin_delete on storage.objects;
create policy payment_qr_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'payment-qr' and public.is_admin());

-- Payment details now include the QR image link (https only).
create or replace function public.admin_set_payment_instructions(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  image text := nullif(btrim(p_value ->> 'khqr_image_url'), '');
begin
  perform public.require_admin();
  if jsonb_typeof(p_value) <> 'object' or length(p_value::text) > 4000 then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  if image is not null and (image !~ '^https://[^\s"<>]+$' or char_length(image) > 500) then
    raise exception 'invalid image url' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('payment_instructions', p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_payment_instructions(jsonb) from public, anon;
grant execute on function public.admin_set_payment_instructions(jsonb) to authenticated;
