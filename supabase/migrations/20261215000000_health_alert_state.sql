-- Health watchdog: which alerts are open, kept in the database so a deploy
-- (a fresh process) still sends the "recovered" message for an alert raised
-- before it. One row per open issue; removed when it recovers.

create table if not exists public.health_alert_state (
  issue      text primary key check (issue ~ '^[a-z_]{2,20}$'),
  alerted_at timestamptz not null default now()
);
alter table public.health_alert_state enable row level security;
revoke all on public.health_alert_state from anon, authenticated;

-- Open issues and when each was last alerted.
create or replace function public.bot_health_alerts(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return coalesce((select jsonb_object_agg(issue, alerted_at) from public.health_alert_state), '{}'::jsonb);
end;
$$;

-- p_open true: an alert was sent now; false: it recovered (row removed).
create or replace function public.bot_health_alert_set(p_key text, p_issue text, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_open then
    insert into public.health_alert_state (issue, alerted_at) values (p_issue, now())
    on conflict (issue) do update set alerted_at = now();
  else
    delete from public.health_alert_state where issue = p_issue;
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_health_alerts(text)', 'public.bot_health_alert_set(text, text, boolean)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
