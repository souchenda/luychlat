-- The Adhan as audio in Telegram (founder, 20/10/2026): a member with prayer alerts can have @luychlat_bot send the app's
-- Adhan recording at each prayer — the app-wide default (Fajr's own at Fajr when there is one) — with the prayer, the
-- time and the place as its caption; meant for iPhones, where a web app cannot play sound with the screen locked. Off
-- by default; switched on in the app (Settings › the official bot) or with /adhan on | off. Turning it on turns the
-- prayer alerts on too (the audio comes with them).

alter table public.telegram_links add column if not exists adhan_audio boolean not null default false;
grant update (adhan_audio) on public.telegram_links to authenticated;

-- /adhan on | off | (toggle) — the linked chat's setting, returned.
create or replace function public.bot_set_adhan_audio(p_key text, p_chat_id bigint, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  now_on boolean;
  province text;
begin
  perform public.require_bot(p_key);
  update public.telegram_links
     set adhan_audio = coalesce(p_on, not adhan_audio),
         prayer_alerts = prayer_alerts or coalesce(p_on, not adhan_audio),
         prayer_province = coalesce(prayer_province, 'phnom_penh')
   where chat_id = p_chat_id
  returning adhan_audio, prayer_province into now_on, province;
  if now_on is null then return jsonb_build_object('status', 'not_linked'); end if;
  return jsonb_build_object('status', 'ok', 'on', now_on, 'province', province);
end $$;
revoke all on function public.bot_set_adhan_audio(text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.bot_set_adhan_audio(text, bigint, boolean) to anon, authenticated;

-- The prayer subscribers (Islamic Mode on, prayer alerts on), now with their Adhan-audio choice.
drop function if exists public.bot_prayer_subscribers(text);
create function public.bot_prayer_subscribers(p_key text)
returns table (user_id uuid, chat_id bigint, language text, province text, adhan_audio boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language, coalesce(l.prayer_province, 'phnom_penh'), l.adhan_audio
    from public.telegram_links l
    join public.islamic_settings s on s.user_id = l.user_id and s.enabled
    where l.prayer_alerts;
end $$;
revoke all on function public.bot_prayer_subscribers(text) from public, anon, authenticated;
grant execute on function public.bot_prayer_subscribers(text) to anon, authenticated;

-- Which recording the bot sends: the app-wide defaults (app_settings «adhan_defaults») and the published global Adhans.
create or replace function public.bot_adhan_tracks(p_key text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return jsonb_build_object(
    'defaults', coalesce((select s.value from public.app_settings s where s.key = 'adhan_defaults'), '{}'::jsonb),
    'global', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name_km', p.name_km, 'name_en', p.name_en, 'credit', p.credit, 'audio_path', p.audio_path) order by p.sort, p.created_at)
                          from public.adhan_presets p where p.active), '[]'::jsonb)
  );
end $$;
revoke all on function public.bot_adhan_tracks(text) from public, anon, authenticated;
grant execute on function public.bot_adhan_tracks(text) to anon, authenticated;
