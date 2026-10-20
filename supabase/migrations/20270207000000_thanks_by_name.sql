-- One to one, by name (founder, 20/10/2026): a member's thank-you greets them by their own name — «អាស្សាឡាមុអាឡៃកុម
-- {name}!» — and «បងប្អូន» when they have none (or only a phone number). The messages arrive with a «{name}» placeholder;
-- the bell notice gets the name here, and the name is returned for the Telegram note.
create or replace function public.bot_contributor_thank(p_key text, p_kind text, p_id uuid, p_islamic_title text, p_islamic_message text, p_general_title text, p_general_message text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member uuid;
  islamic boolean;
  ws uuid;
  chat bigint;
  who text;
begin
  perform public.require_bot(p_key);
  if p_kind = 'place' then
    select p.created_by into member from public.islamic_places p where p.id = p_id and p.approved and p.source = 'community';
  elsif p_kind = 'qasidah' then
    select t.submitted_by into member from public.nasheed_tracks t where t.id = p_id and t.status = 'APPROVED';
  end if;
  if member is null then return null; end if;
  islamic := coalesce((select s.enabled from public.islamic_settings s where s.user_id = member), false);
  who := nullif(btrim((select pr.display_name from public.profiles pr where pr.id = member)), '');
  if who is null or who ~ '^\+?[0-9 -]{6,}$' then who := 'បងប្អូន'; end if;
  who := left(who, 40);
  select w.id into ws from public.workspaces w where w.user_id = member and w.type = 'PERSONAL';
  if ws is not null then
    insert into public.notifications (workspace_id, title, message, type)
    values (ws, left(replace(case when islamic then p_islamic_title else p_general_title end, '{name}', who), 200),
                left(replace(case when islamic then p_islamic_message else p_general_message end, '{name}', who), 1000), 'SYSTEM');
  end if;
  select l.chat_id into chat from public.telegram_links l where l.user_id = member limit 1;
  return jsonb_build_object('islamic', islamic, 'chat_id', chat, 'name', who);
end $$;
revoke all on function public.bot_contributor_thank(text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_contributor_thank(text, text, uuid, text, text, text, text) to anon, authenticated;
