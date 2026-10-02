-- Phase C: the official LuyChlat Telegram bot (@LuyChlat_bot).
--
-- The bot runs on our server (TELEGRAM_BOT_TOKEN in its environment). The
-- server has no master database key: it calls only the bot_* functions below,
-- which check a key derived from the bot token. Only that key's SHA-256 is
-- stored here (bot_config), set once by an admin ("Activate bot" in /admin).
--
-- Linking: the app asks for a one-time code (create_telegram_link_code), the
-- user opens t.me/<bot>?start=<code>, and the bot links that chat to them.
-- Reminders: the server sends due-date notifications (debts, cards) and, if
-- the user turned it on, prayer times for their chosen province.

create table if not exists public.bot_config (
  id         smallint primary key default 1 check (id = 1),
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  username   text check (username is null or username ~ '^[A-Za-z0-9_]{5,32}$'),
  updated_at timestamptz not null default now()
);
alter table public.bot_config enable row level security;
revoke all on public.bot_config from anon, authenticated;

create table if not exists public.telegram_links (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  chat_id         bigint not null unique,
  username        text check (username is null or char_length(username) <= 64),
  language        text not null default 'km' check (language in ('km', 'en')),
  debt_alerts     boolean not null default true,
  prayer_alerts   boolean not null default false,
  -- A province key from lib/prayer.ts PROVINCES (never GPS).
  prayer_province text check (prayer_province is null or prayer_province ~ '^[a-z_]{2,30}$'),
  linked_at       timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
drop policy if exists telegram_links_select on public.telegram_links;
create policy telegram_links_select on public.telegram_links for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists telegram_links_update on public.telegram_links;
create policy telegram_links_update on public.telegram_links for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists telegram_links_delete on public.telegram_links;
create policy telegram_links_delete on public.telegram_links for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.telegram_links from anon, authenticated;
grant select, delete on public.telegram_links to authenticated;
grant update (language, debt_alerts, prayer_alerts, prayer_province) on public.telegram_links to authenticated;

create table if not exists public.telegram_link_codes (
  code       text primary key check (code ~ '^[0-9a-f]{32}$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;

create table if not exists public.telegram_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  sent_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);
alter table public.telegram_deliveries enable row level security;
revoke all on public.telegram_deliveries from anon, authenticated;

create table if not exists public.telegram_prayer_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  prayer  text not null check (prayer in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  primary key (user_id, day, prayer)
);
alter table public.telegram_prayer_sent enable row level security;
revoke all on public.telegram_prayer_sent from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Key check: SHA-256 of the key the server derives from the bot token.
-- ---------------------------------------------------------------------------
create or replace function public.bot_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null and char_length(p_key) between 32 and 128
    and exists (select 1 from public.bot_config c where c.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'))
$$;
revoke all on function public.bot_key_ok(text) from public, anon, authenticated;

create or replace function public.require_bot(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.bot_key_ok(p_key) then
    raise exception 'bot not authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_bot(text) from public, anon, authenticated;

-- Admin ("Activate bot"): store the key's hash and the bot's username.
create or replace function public.admin_set_bot(p_key_hash text, p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  insert into public.bot_config (id, key_hash, username, updated_at) values (1, lower(p_key_hash), p_username, now())
  on conflict (id) do update set key_hash = excluded.key_hash, username = excluded.username, updated_at = now();
  insert into public.app_settings (key, value, updated_at) values ('telegram_bot', jsonb_build_object('username', p_username), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_bot(text, text) from public, anon;
grant execute on function public.admin_set_bot(text, text) to authenticated;

-- App: a one-time code for t.me/<bot>?start=<code> (15 minutes).
create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_code text := replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.telegram_link_codes where user_id = uid or expires_at < now();
  insert into public.telegram_link_codes (code, user_id, expires_at) values (new_code, uid, now() + interval '15 minutes');
  return new_code;
end;
$$;
revoke all on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Bot (server) functions: each needs the bot key.
-- ---------------------------------------------------------------------------

-- /start <code>: link this chat to the code's user. Returns their display name.
create or replace function public.bot_link_chat(p_key text, p_code text, p_chat_id bigint, p_username text, p_language text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  name text;
begin
  perform public.require_bot(p_key);
  delete from public.telegram_link_codes where code = lower(coalesce(p_code, '')) and expires_at >= now() returning user_id into uid;
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  -- One chat belongs to one account.
  delete from public.telegram_links where chat_id = p_chat_id and user_id <> uid;
  insert into public.telegram_links (user_id, chat_id, username, language)
  values (uid, p_chat_id, left(p_username, 64), case when p_language = 'en' then 'en' else 'km' end)
  on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username, linked_at = now();
  -- The official bot replaces a personal bot: no double messages.
  update public.telegram_settings set enabled = false where user_id = uid;
  select display_name into name from public.profiles where id = uid;
  return jsonb_build_object('ok', true, 'name', coalesce(name, ''));
end;
$$;

-- /stop: unlink this chat.
create or replace function public.bot_unlink_chat(p_key text, p_chat_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  delete from public.telegram_links where chat_id = p_chat_id;
  return found;
end;
$$;

-- Due-date notifications (debts, installments, cards) from the last two days
-- not yet sent to each linked member of the workspace.
create or replace function public.bot_due_notifications(p_key text, p_limit integer default 100)
returns table (notification_id uuid, user_id uuid, chat_id bigint, language text, title text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select n.id, l.user_id, l.chat_id, l.language, n.title, n.message
    from public.notifications n
    join public.workspace_members wm on wm.workspace_id = n.workspace_id
    join public.telegram_links l on l.user_id = wm.user_id and l.debt_alerts
    where n.type = 'DUE_DATE'
      and n.created_at > now() - interval '2 days'
      and not exists (select 1 from public.telegram_deliveries d where d.notification_id = n.id and d.user_id = l.user_id)
    order by n.created_at
    limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function public.bot_mark_delivered(p_key text, p_notification_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.telegram_deliveries (notification_id, user_id) values (p_notification_id, p_user_id) on conflict do nothing;
end;
$$;

-- People who want prayer-time messages, with their province.
create or replace function public.bot_prayer_subscribers(p_key text)
returns table (user_id uuid, chat_id bigint, language text, province text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select l.user_id, l.chat_id, l.language, coalesce(l.prayer_province, 'phnom_penh')
    from public.telegram_links l
    where l.prayer_alerts;
end;
$$;

-- Each prayer is announced once per person and day (true = this call claimed it).
create or replace function public.bot_claim_prayer(p_key text, p_user_id uuid, p_day date, p_prayer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed integer;
begin
  perform public.require_bot(p_key);
  insert into public.telegram_prayer_sent (user_id, day, prayer) values (p_user_id, p_day, p_prayer) on conflict do nothing;
  get diagnostics claimed = row_count;
  delete from public.telegram_prayer_sent where day < current_date - 7;
  return claimed > 0;
end;
$$;

-- The server's bot calls these without a user session: anon may execute, the key decides.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_link_chat(text, text, bigint, text, text)',
    'public.bot_unlink_chat(text, bigint)',
    'public.bot_due_notifications(text, integer)',
    'public.bot_mark_delivered(text, uuid, uuid)',
    'public.bot_prayer_subscribers(text)',
    'public.bot_claim_prayer(text, uuid, date, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
