-- What the SoundBox phone actually did for each payment (founder, 14/10/2026 — the 13:38 payment chimed,
-- then said nothing): the page reports its steps ("visible chime km:timeout km:retry:timeout en:spoken"),
-- so a silent announcement is diagnosed from facts, never guessed. Members of the payment's workspace only;
-- read by the operators (service role), never shown to other users.
create table if not exists public.soundbox_reports (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.soundbox_events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  log        text not null check (char_length(log) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists soundbox_reports_event_idx on public.soundbox_reports (event_id);
alter table public.soundbox_reports enable row level security;
revoke all on public.soundbox_reports from public, anon, authenticated;

create or replace function public.soundbox_report(p_event uuid, p_log text, p_ua text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (select 1 from public.soundbox_events e where e.id = p_event and public.is_workspace_member(e.workspace_id)) then
    return;
  end if;
  -- One phone, one payment: at most a few reports (a reconnect may replay it).
  if (select count(*) from public.soundbox_reports r where r.event_id = p_event and r.user_id = auth.uid()) >= 3 then
    return;
  end if;
  insert into public.soundbox_reports (event_id, user_id, log, user_agent)
  values (p_event, auth.uid(), left(coalesce(p_log, ''), 500), left(p_ua, 200));
end;
$$;
revoke all on function public.soundbox_report(uuid, text, text) from public, anon;
grant execute on function public.soundbox_report(uuid, text, text) to authenticated;
