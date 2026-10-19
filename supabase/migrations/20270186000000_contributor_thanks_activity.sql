-- The approval room as the founder's live activity stream, and thanks to contributors (founder, 19/10/2026).

-- 1. The Kampot surau a member suggested — approved on the founder's word (19/10/2026, screenshot 565da4).
update public.islamic_places
   set approved = true, notified = true
 where kind = 'SURAU' and province = 'កំពត' and name = 'Surau' and not approved and source = 'community';

-- 2. Each pending suggestion is claimed once (sent at once by the server after the insert, else by the
--    dispatcher), with the member's community for the card's badge; a failed send hands it back.
drop function if exists public.bot_places_to_notify(text);
create function public.bot_places_to_notify(p_key text)
returns table (id uuid, kind text, name text, province text, address text, lat double precision, lng double precision, note text, submitter text, islamic boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query
  with claimed as (
    update public.islamic_places p set notified = true
     where p.id in (select q.id from public.islamic_places q where not q.approved and not q.notified order by q.created_at limit 10 for update skip locked)
    returning p.*
  )
  select c.id, c.kind, c.name, c.province, c.address, c.lat, c.lng, c.note,
         coalesce(nullif(btrim(pr.display_name), ''),
                  case when u.email like '%@phone.luy.ibmserp.com' then '+' || split_part(u.email::text, '@', 1) end,
                  '—'),
         coalesce(s.enabled, false)
  from claimed c
  left join public.profiles pr on pr.id = c.created_by
  left join auth.users u on u.id = c.created_by
  left join public.islamic_settings s on s.user_id = c.created_by;
end $$;
revoke all on function public.bot_places_to_notify(text) from public, anon, authenticated;
grant execute on function public.bot_places_to_notify(text) to anon, authenticated;

create or replace function public.bot_place_unclaim(p_key text, p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.islamic_places set notified = false where id = p_id and not approved;
end $$;
revoke all on function public.bot_place_unclaim(text, uuid) from public, anon, authenticated;
grant execute on function public.bot_place_unclaim(text, uuid) to anon, authenticated;

-- 3. Thanks once a contribution is approved: a bell notice in the member's Personal space, the wording by their
--    community (Islamic blessings only in Islamic Mode — lib/contributor-thanks.ts); their Telegram chat back for a
--    note there too. Only for an approved place / qasidah that a member suggested.
create or replace function public.bot_contributor_thank(p_key text, p_kind text, p_id uuid, p_islamic_title text, p_islamic_message text, p_general_title text, p_general_message text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member uuid;
  islamic boolean;
  ws uuid;
  chat bigint;
begin
  perform public.require_bot(p_key);
  if p_kind = 'place' then
    select p.created_by into member from public.islamic_places p where p.id = p_id and p.approved and p.source = 'community';
  elsif p_kind = 'qasidah' then
    select t.submitted_by into member from public.nasheed_tracks t where t.id = p_id and t.status = 'APPROVED';
  end if;
  if member is null then return null; end if;
  islamic := coalesce((select s.enabled from public.islamic_settings s where s.user_id = member), false);
  select w.id into ws from public.workspaces w where w.user_id = member and w.type = 'PERSONAL';
  if ws is not null then
    insert into public.notifications (workspace_id, title, message, type)
    values (ws, left(case when islamic then p_islamic_title else p_general_title end, 200),
                left(case when islamic then p_islamic_message else p_general_message end, 1000), 'SYSTEM');
  end if;
  select l.chat_id into chat from public.telegram_links l where l.user_id = member limit 1;
  return jsonb_build_object('islamic', islamic, 'chat_id', chat);
end $$;
revoke all on function public.bot_contributor_thank(text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_contributor_thank(text, text, uuid, text, text, text, text) to anon, authenticated;

-- 4. New members to the approval room at once (no 10-minute wait for «where did you hear of us»; the answer shows
--    when it is already given), with their community for the badge.
drop function if exists public.bot_signup_alerts_pending(text);
create function public.bot_signup_alerts_pending(p_key text)
returns table(user_id uuid, email text, provider text, created_at timestamptz, total_members bigint, display_name text, acquisition_source text, islamic boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select u.id, u.email::text,
      case
        when public.is_phone_login_email(u.email) then 'phone'
        else coalesce(u.raw_app_meta_data ->> 'provider', 'email')
      end,
      u.created_at,
      (select count(*) from auth.users),
      pr.display_name,
      pp.acquisition_source,
      coalesce(s.enabled, false)
    from public.signup_alerts a
    join auth.users u on u.id = a.user_id
    left join public.profiles pr on pr.id = a.user_id
    left join public.profile_private pp on pp.user_id = a.user_id
    left join public.islamic_settings s on s.user_id = a.user_id
    where a.sent_at is null and a.created_at > now() - interval '2 days'
    order by a.created_at
    limit 20;
end;
$$;
revoke all on function public.bot_signup_alerts_pending(text) from public, anon, authenticated;
grant execute on function public.bot_signup_alerts_pending(text) to anon, authenticated;
