-- A member who leaves is never silent (founder, 8/11/2026: «សមាជិកថ្មី» Men Somanit announced at 06:49 with «សរុប 9 នាក់»,
-- then gone from Admin › «អ្នកប្រើ និងគម្រោង» (8) with no trace for the founder). Every removed sign-in — the member's own
-- «លុបគណនី», or one removed from the Supabase dashboard — queues a card for the founder's private chat, like the sign-up
-- card (lib/server/member-events.ts flushDepartureAlerts). Only what the sign-up card already showed: the name, the
-- account and the dates — never a balance. Additive: a table, a trigger and two bot functions.

create table if not exists public.member_departures (
  id           bigserial primary key,
  user_id      uuid not null,           -- no foreign key: the account is gone
  email        text,
  display_name text,
  joined_at    timestamptz,
  self_deleted boolean not null default false,
  deleted_at   timestamptz not null default now(),
  sent_at      timestamptz
);
alter table public.member_departures enable row level security;
revoke all on public.member_departures from anon, authenticated;

-- BEFORE the delete, so the profile (removed by its cascade) can still be read. Never blocks or fails a delete.
create or replace function public.queue_member_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.member_departures (user_id, email, display_name, joined_at, self_deleted)
    values (old.id, old.email::text, (select pr.display_name from public.profiles pr where pr.id = old.id), old.created_at,
            (select auth.uid()) is not distinct from old.id);
  exception when others then
    null;
  end;
  return old;
end;
$$;

drop trigger if exists on_auth_user_departure_alert on auth.users;
create trigger on_auth_user_departure_alert
  before delete on auth.users
  for each row execute function public.queue_member_departure();

create or replace function public.bot_departure_alerts_pending(p_key text)
returns table(id bigint, email text, display_name text, joined_at timestamptz, self_deleted boolean, deleted_at timestamptz, total_members bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select d.id, d.email, d.display_name, d.joined_at, d.self_deleted, d.deleted_at, (select count(*) from auth.users)
    from public.member_departures d
    where d.sent_at is null and d.deleted_at > now() - interval '2 days'
    order by d.deleted_at
    limit 20;
end;
$$;
revoke all on function public.bot_departure_alerts_pending(text) from public, anon, authenticated;
grant execute on function public.bot_departure_alerts_pending(text) to anon, authenticated;

create or replace function public.bot_departure_alert_sent(p_key text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  update public.member_departures set sent_at = now() where id = p_id and sent_at is null;
end;
$$;
revoke all on function public.bot_departure_alert_sent(text, bigint) from public, anon, authenticated;
grant execute on function public.bot_departure_alert_sent(text, bigint) to anon, authenticated;
