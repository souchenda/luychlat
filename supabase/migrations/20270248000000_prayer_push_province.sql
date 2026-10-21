-- The prayer push at the phone's own province (founder, 21/10/2026 — Yerny's lock screen rang at 18:52 «Phnom Penh»
-- while her app, set to Kampot, said Isha at 18:56): the server only knew the bot's prayer province, else Phnom Penh. Each
-- phone now saves the province picked in the app (or the one nearest «my location» — the GPS stays on the phone) on its
-- push subscription; the dispatcher rings each member's phones by province, at that province's time, with its name.

alter table public.push_subscriptions add column if not exists prayer_province text
  check (prayer_province is null or prayer_province ~ '^[a-z_]{2,40}$');

-- The member's own phone: the app saves its province whenever it changes (components/islamic/location-picker).
create or replace function public.set_prayer_province(p_endpoint text, p_province text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if p_province !~ '^[a-z_]{2,40}$' then raise exception 'invalid province'; end if;
  update public.push_subscriptions set prayer_province = p_province where endpoint = p_endpoint and user_id = (select auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.set_prayer_province(text, text) from public, anon;
grant execute on function public.set_prayer_province(text, text) to authenticated;

-- The phones to ring: the phone's own province first, then the member's Telegram prayer province, then Phnom Penh.
create or replace function public.bot_prayer_push_targets(p_key text)
returns table (user_id uuid, endpoint text, p256dh text, auth text, province text, language text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
    select p.user_id, p.endpoint, p.p256dh, p.auth,
           coalesce(
             p.prayer_province,
             (select l.prayer_province from public.telegram_links l where l.user_id = p.user_id and l.prayer_province is not null limit 1),
             'phnom_penh'),
           coalesce((select l.language from public.telegram_links l where l.user_id = p.user_id limit 1), 'km')
    from public.push_subscriptions p
    join public.islamic_settings s on s.user_id = p.user_id and s.enabled
    where p.prayer_alerts;
end $$;

-- One claim per member, day, prayer AND province: a member's phones in two provinces each ring at their own time.
alter table public.push_prayer_sent add column if not exists province text not null default '';
alter table public.push_prayer_sent drop constraint if exists push_prayer_sent_pkey;
alter table public.push_prayer_sent add primary key (user_id, day, prayer, province);

create or replace function public.bot_claim_prayer_push(p_key text, p_user_id uuid, p_day date, p_prayer text, p_province text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform public.require_bot(p_key);
  insert into public.push_prayer_sent (user_id, day, prayer, province) values (p_user_id, p_day, p_prayer, coalesce(p_province, ''))
    on conflict do nothing;
  get diagnostics n = row_count;
  delete from public.push_prayer_sent where day < current_date - 7;
  return n > 0;
end $$;
revoke all on function public.bot_claim_prayer_push(text, uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.bot_claim_prayer_push(text, uuid, date, text, text) to anon, authenticated;
-- The 4-argument claim stays for the running version until the new one is live (it claims with province '').
