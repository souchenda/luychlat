-- Telegram groups: the bot only stays where it has work.
--
-- 1. Auto-leave: every group the bot is in is tracked (on being added, and on
--    any message for groups it was already in). A group with no ACTIVE pool
--    linked for 10 minutes — a new group nobody linked with /pool link CODE,
--    or a group whose pool was unlinked or settled — gets a polite note and
--    the bot leaves (the community chat is skipped in the app).
-- 2. Paywall: linking a group to a pool in a BUSINESS workspace needs a paid
--    plan (PRO / ULTRA). Super admins are exempt, and a pool already linked to
--    a group (re-linking it) is never blocked. Personal pools stay free.

create table if not exists public.telegram_groups (
  chat_id        bigint primary key,
  joined_at      timestamptz not null default now(),
  -- Since when no active pool has been linked here (null while one is).
  unlinked_since timestamptz default now()
);
alter table public.telegram_groups enable row level security;
revoke all on public.telegram_groups from anon, authenticated;

-- The bot was added (p_joined) or a message came from a group it is in.
create or replace function public.bot_group_seen(p_key text, p_group bigint, p_joined boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_joined then
    -- A fresh join: 10 minutes from now to link a pool.
    insert into public.telegram_groups (chat_id, joined_at, unlinked_since) values (p_group, now(), now())
    on conflict (chat_id) do update set joined_at = now(), unlinked_since = now();
  else
    insert into public.telegram_groups (chat_id) values (p_group) on conflict (chat_id) do nothing;
  end if;
end;
$$;

-- Groups to leave now: no active pool linked for 10 minutes.
create or replace function public.bot_group_sweep(p_key text)
returns table (chat_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.telegram_groups g set unlinked_since = null
   where g.unlinked_since is not null
     and exists (select 1 from public.pools p where p.tg_chat_id = g.chat_id and p.status = 'active');
  update public.telegram_groups g set unlinked_since = now()
   where g.unlinked_since is null
     and not exists (select 1 from public.pools p where p.tg_chat_id = g.chat_id and p.status = 'active');
  return query
    select g.chat_id from public.telegram_groups g
     where g.unlinked_since < now() - interval '10 minutes'
     order by g.unlinked_since
     limit 20;
end;
$$;

-- The bot left (or was removed): stop tracking the group.
create or replace function public.bot_group_forget(p_key text, p_group bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  delete from public.telegram_groups where chat_id = p_group;
end;
$$;

create or replace function public.bot_pool_link(p_key text, p_group bigint, p_from bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  p public.pools;
begin
  perform public.require_bot(p_key);
  uid := public.bot_user_of(p_from);
  if uid is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  select * into p from public.pools
  where tg_link_code = upper(btrim(p_code)) and tg_link_expires > now() and status = 'active' and created_by = uid
  for update;
  if p.id is null then
    return jsonb_build_object('status', 'bad_code');
  end if;
  -- Business expense tracking in a group: paid plans only (super admins and already-linked pools exempt).
  if p.tg_chat_id is null
     and (select w.type::text from public.workspaces w where w.id = p.workspace_id) = 'BUSINESS'
     and public.plan_code_of(uid) = 'FREE'
     and not exists (select 1 from public.app_admins a where a.user_id = uid and a.role = 'super_admin') then
    return jsonb_build_object('status', 'plan_required');
  end if;
  update public.pools set tg_chat_id = null where tg_chat_id = p_group and id <> p.id;
  update public.pools set tg_chat_id = p_group, tg_link_code = null, posted_until = now() where id = p.id;
  -- Linked: the group is no longer waiting to be left.
  update public.telegram_groups set unlinked_since = null where chat_id = p_group;
  return jsonb_build_object('status', 'ok', 'title', p.title);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_group_seen(text, bigint, boolean)',
    'public.bot_group_sweep(text)',
    'public.bot_group_forget(text, bigint)',
    'public.bot_pool_link(text, bigint, bigint, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- Groups already linked to an active pool start out as linked (they stay).
insert into public.telegram_groups (chat_id, unlinked_since)
select distinct tg_chat_id, null::timestamptz from public.pools where tg_chat_id is not null and status = 'active'
on conflict (chat_id) do nothing;
