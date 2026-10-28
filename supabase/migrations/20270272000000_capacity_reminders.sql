-- Capacity and spending reminders (founder, 28/10/2026 — «remind me when it is time to act or spend»): the bot reads the
-- server agent's report (public.ops_status) and remembers which items it already told the founder about, so each is
-- sent once and again only 7 days later (lib/capacity.ts, lib/server/capacity-reminder.ts).
create table if not exists public.capacity_reminders (
  item text primary key,
  level text not null,
  sent_at timestamptz not null default now()
);
alter table public.capacity_reminders enable row level security;
-- No direct access: the bot's functions below only.

create or replace function public.bot_ops_summary(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return (select value from public.ops_status where key = 'summary');
end;
$$;

create or replace function public.bot_capacity_reminders(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return coalesce((select jsonb_object_agg(item, jsonb_build_object('level', level, 'sent_at', sent_at)) from public.capacity_reminders), '{}'::jsonb);
end;
$$;

create or replace function public.bot_capacity_mark(p_key text, p_item text, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.capacity_reminders (item, level, sent_at) values (left(p_item, 40), left(p_level, 10), now())
  on conflict (item) do update set level = excluded.level, sent_at = now();
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_ops_summary(text)', 'public.bot_capacity_reminders(text)', 'public.bot_capacity_mark(text, text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
