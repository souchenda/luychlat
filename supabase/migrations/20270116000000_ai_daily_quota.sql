-- AI guardrail layer 3: freeform AI questions on the FREE plan — 10 a day, reset at
-- 00:00 Asia/Phnom_Penh. Paid plans keep their monthly quota (usage_counters).
-- Logging, slips, bills and KHQR never go through this function: they stay unlimited.

create table if not exists public.user_ai_chat_daily_count (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);
alter table public.user_ai_chat_daily_count enable row level security;
drop policy if exists "own daily ai count" on public.user_ai_chat_daily_count;
create policy "own daily ai count" on public.user_ai_chat_daily_count for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_ai_chat_daily_count from anon;
revoke insert, update, delete on public.user_ai_chat_daily_count from authenticated;

create or replace function public.use_ai_query(p_commit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lim integer;
  used integer;
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  free_daily constant integer := 10;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  lim := (public.plan_of(uid)).ai_queries_per_month;
  if lim <= 0 then
    -- FREE: a small daily allowance instead of none.
    select coalesce((select d.count from public.user_ai_chat_daily_count d where d.user_id = uid and d.day = today), 0) into used;
    if used >= free_daily then
      return jsonb_build_object('ok', false, 'reason', 'daily_quota', 'limit', free_daily, 'used', used, 'daily', true);
    end if;
    if p_commit then
      insert into public.user_ai_chat_daily_count (user_id, day, count) values (uid, today, 1)
      on conflict (user_id, day) do update set count = public.user_ai_chat_daily_count.count + 1
      returning count into used;
    end if;
    return jsonb_build_object('ok', true, 'limit', free_daily, 'used', used, 'daily', true);
  end if;
  select coalesce((select ai_queries from public.usage_counters where user_id = uid and month = public.current_ai_month()), 0)
    into used;
  if used >= lim then
    return jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'limit', lim, 'used', used);
  end if;
  if p_commit then
    insert into public.usage_counters (user_id, month, ai_queries) values (uid, public.current_ai_month(), 1)
    on conflict (user_id, month) do update set ai_queries = public.usage_counters.ai_queries + 1
    returning ai_queries into used;
  end if;
  return jsonb_build_object('ok', true, 'limit', lim, 'used', used);
end;
$$;

-- Old rows are of no use after the day: keep a week.
delete from public.user_ai_chat_daily_count where day < (now() at time zone 'Asia/Phnom_Penh')::date - 7;

select public.apply_security_gate();
