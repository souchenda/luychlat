-- Prayer-time Web Push (founder, 20/10/2026 — «Android devices ring the Adhan automatically even when the app is
-- closed»): at each prayer the server pushes a notification to the phones of Islamic Mode members. The app's own alert
-- only runs while the app is open; this one reaches a closed app. Per phone: on by default, and the app's prayer-alert
-- switch turns it off or on for that phone (set_prayer_push). Once per member, day and prayer (bot_claim_prayer_push).

alter table public.push_subscriptions add column if not exists prayer_alerts boolean not null default true;

create table if not exists public.push_prayer_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  prayer text not null check (prayer in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  primary key (user_id, day, prayer)
);
alter table public.push_prayer_sent enable row level security;
revoke all on public.push_prayer_sent from public, anon, authenticated;

-- The member's own phone: the prayer-alert switch in the app.
create or replace function public.set_prayer_push(p_endpoint text, p_on boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  update public.push_subscriptions set prayer_alerts = p_on where endpoint = p_endpoint and user_id = (select auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.set_prayer_push(text, boolean) from public, anon;
grant execute on function public.set_prayer_push(text, boolean) to authenticated;

-- The phones to ring: Islamic Mode on, prayer alerts on for that phone; the member's Telegram prayer province if set.
create or replace function public.bot_prayer_push_targets(p_key text)
returns table (user_id uuid, endpoint text, p256dh text, auth text, province text, language text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
    select p.user_id, p.endpoint, p.p256dh, p.auth,
           coalesce((select l.prayer_province from public.telegram_links l where l.user_id = p.user_id and l.prayer_province is not null limit 1), 'phnom_penh'),
           coalesce((select l.language from public.telegram_links l where l.user_id = p.user_id limit 1), 'km')
    from public.push_subscriptions p
    join public.islamic_settings s on s.user_id = p.user_id and s.enabled
    where p.prayer_alerts;
end $$;
revoke all on function public.bot_prayer_push_targets(text) from public, anon, authenticated;
grant execute on function public.bot_prayer_push_targets(text) to anon, authenticated;

-- Once per member, day and prayer (all their phones are rung in that one pass).
create or replace function public.bot_claim_prayer_push(p_key text, p_user_id uuid, p_day date, p_prayer text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform public.require_bot(p_key);
  insert into public.push_prayer_sent (user_id, day, prayer) values (p_user_id, p_day, p_prayer) on conflict do nothing;
  get diagnostics n = row_count;
  delete from public.push_prayer_sent where day < current_date - 7;
  return n > 0;
end $$;
revoke all on function public.bot_claim_prayer_push(text, uuid, date, text) from public, anon, authenticated;
grant execute on function public.bot_claim_prayer_push(text, uuid, date, text) to anon, authenticated;
