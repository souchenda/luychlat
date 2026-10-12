-- Preview-first channel posts with an auto-publish fallback (founder, 12/10/2026).
-- The 07:00 morning poster, the holiday notes and a fuel price change are each scheduled here:
-- the founder gets a preview in their private Telegram chat 45 minutes before, with
-- [ 🚀 ផុសភ្លាមៗ ] and [ ❌ ផ្អាកថ្ងៃនេះ ]; with no action the post goes out at its time.
-- A row leaves PENDING exactly once (bot_post_take), so the button and the timer can never both
-- publish it.

create table if not exists public.scheduled_posts (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('MORNING', 'HOLIDAY', 'FUEL')),
  post_key    text not null check (char_length(post_key) between 1 and 80),
  payload     jsonb not null default '{}'::jsonb,
  publish_at  timestamptz not null,
  status      text not null default 'PENDING' check (status in ('PENDING', 'PUBLISHED', 'PAUSED', 'EXPIRED')),
  previews    jsonb not null default '[]'::jsonb,
  decided_by  uuid references auth.users (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (kind, post_key)
);
alter table public.scheduled_posts enable row level security;
revoke all on public.scheduled_posts from anon, authenticated;
create index if not exists scheduled_posts_pending_idx on public.scheduled_posts (publish_at) where status = 'PENDING';

-- Schedule a post once: a second call returns the existing row (created = false).
create or replace function public.bot_post_schedule(p_key text, p_kind text, p_post_key text, p_payload jsonb, p_publish_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_posts;
begin
  perform public.require_bot(p_key);
  delete from public.scheduled_posts where created_at < now() - interval '60 days';
  insert into public.scheduled_posts (kind, post_key, payload, publish_at)
  values (p_kind, p_post_key, coalesce(p_payload, '{}'::jsonb), p_publish_at)
  on conflict (kind, post_key) do nothing
  returning * into r;
  if r.id is not null then
    return to_jsonb(r) || jsonb_build_object('created', true);
  end if;
  select * into r from public.scheduled_posts where kind = p_kind and post_key = p_post_key;
  return to_jsonb(r) || jsonb_build_object('created', false);
end;
$$;

create or replace function public.bot_post_set_previews(p_key text, p_id bigint, p_previews jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  update public.scheduled_posts set previews = coalesce(p_previews, '[]'::jsonb) where id = p_id;
end;
$$;

create or replace function public.bot_post_get(p_key text, p_id bigint)
returns public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_posts;
begin
  perform public.require_bot(p_key);
  select * into r from public.scheduled_posts where id = p_id;
  return r;
end;
$$;

-- PENDING → PUBLISHED / PAUSED / EXPIRED, once. From a button (p_chat_id) only a super admin's linked
-- chat may decide; the timer passes no chat. Returns null when the row had already left PENDING.
create or replace function public.bot_post_take(p_key text, p_id bigint, p_status text, p_chat_id bigint default null)
returns public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  r public.scheduled_posts;
begin
  perform public.require_bot(p_key);
  if p_status not in ('PUBLISHED', 'PAUSED', 'EXPIRED') then raise exception 'bad status' using errcode = '22023'; end if;
  if p_chat_id is not null then
    actor := public.tip_chat_super_admin(p_chat_id);
    if actor is null then raise exception 'super admin only' using errcode = '42501'; end if;
  end if;
  update public.scheduled_posts
     set status = p_status, decided_by = actor, decided_at = now()
   where id = p_id and status = 'PENDING'
  returning * into r;
  return r;
end;
$$;

-- Pending posts whose time has come (oldest first).
create or replace function public.bot_posts_due(p_key text)
returns setof public.scheduled_posts
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return query select * from public.scheduled_posts where status = 'PENDING' and publish_at <= now() order by publish_at limit 10;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_post_schedule(text, text, text, jsonb, timestamptz)',
    'public.bot_post_set_previews(text, bigint, jsonb)',
    'public.bot_post_get(text, bigint)',
    'public.bot_post_take(text, bigint, text, bigint)',
    'public.bot_posts_due(text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
