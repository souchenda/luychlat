-- Phone push notifications (Web Push, PWA): one row per device that said yes.
-- The browser hands the app an endpoint and two keys; the server sends the 07:00
-- morning message to every endpoint (src/lib/server/web-push.ts) and drops the ones
-- the push service says are gone. A user sees and removes only their own devices.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 8 and 100),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 200),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, delete on public.push_subscriptions to authenticated;
drop policy if exists push_own_select on public.push_subscriptions;
create policy push_own_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_own_insert on public.push_subscriptions;
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- A device that subscribes again (new keys, or another account on the same phone) replaces its row.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now();
end;
$$;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

-- The server (bot key): every device of an active account.
create or replace function public.bot_push_targets(p_key text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
  select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
  where not exists (select 1 from public.account_controls c where c.user_id = s.user_id and c.suspended_at is not null);
end;
$$;
revoke all on function public.bot_push_targets(text) from public;
grant execute on function public.bot_push_targets(text) to anon, authenticated;

-- After a send: gone endpoints (404 / 410) are removed, delivered ones stamped.
create or replace function public.bot_push_result(p_key text, p_gone text[], p_ok text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  delete from public.push_subscriptions where endpoint = any (coalesce(p_gone, '{}'));
  update public.push_subscriptions set last_ok_at = now() where endpoint = any (coalesce(p_ok, '{}'));
end;
$$;
revoke all on function public.bot_push_result(text, text[], text[]) from public;
grant execute on function public.bot_push_result(text, text[], text[]) to anon, authenticated;

select public.apply_security_gate();
