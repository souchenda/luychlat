-- SoundBox heartbeat (founder, 14/10/2026): the /soundbox page reports its state every minute (and on
-- any change) — page shown, sound unlocked, live connection, screen wake lock — so the business can see
-- whether a counter phone is ready, and the owner is told on Telegram when:
--   • a sale arrives while no SoundBox is ready («🔇 no SoundBox open — this sale wasn't announced»);
--   • the counter phone has been gone (closed, locked, offline) over 5 minutes during 07:00–21:00.
-- One row per browser (the page makes its own id). Members read their business's devices; writes go
-- only through soundbox_heartbeat().

create table if not exists public.soundbox_devices (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  platform       text check (platform is null or char_length(platform) <= 20),
  visible        boolean not null default false,
  audio_unlocked boolean not null default false,
  live           boolean not null default false,
  wake           text check (wake is null or wake in ('on', 'unsupported', 'denied')),
  last_seen      timestamptz not null default now(),
  last_ready_at  timestamptz,
  alerted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists soundbox_devices_ws_idx on public.soundbox_devices (workspace_id, last_seen desc);
alter table public.soundbox_devices enable row level security;
revoke all on public.soundbox_devices from public, anon, authenticated;
grant select on public.soundbox_devices to authenticated;
drop policy if exists soundbox_devices_member on public.soundbox_devices;
create policy soundbox_devices_member on public.soundbox_devices
  for select to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.soundbox_heartbeat(p_device uuid, p_workspace uuid, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visible boolean := coalesce((p_state ->> 'visible')::boolean, false);
  v_audio boolean := coalesce((p_state ->> 'audio_unlocked')::boolean, false);
  v_live boolean := coalesce((p_state ->> 'live')::boolean, false);
  v_wake text := nullif(p_state ->> 'wake', '');
  v_ready boolean;
begin
  if auth.uid() is null or p_device is null or not public.is_workspace_member(p_workspace) then
    return;
  end if;
  if v_wake is not null and v_wake not in ('on', 'unsupported', 'denied') then
    v_wake := null;
  end if;
  v_ready := v_visible and v_audio and v_live;
  insert into public.soundbox_devices as d (id, user_id, workspace_id, platform, visible, audio_unlocked, live, wake, last_seen, last_ready_at)
  values (p_device, auth.uid(), p_workspace, left(p_state ->> 'platform', 20), v_visible, v_audio, v_live, v_wake, now(), case when v_ready then now() end)
  on conflict (id) do update set
    workspace_id = excluded.workspace_id, platform = excluded.platform, visible = excluded.visible,
    audio_unlocked = excluded.audio_unlocked, live = excluded.live, wake = excluded.wake, last_seen = now(),
    last_ready_at = case when v_ready then now() else d.last_ready_at end
  where d.user_id = auth.uid(); -- another person's device id is never taken over
end;
$$;
revoke all on function public.soundbox_heartbeat(uuid, uuid, jsonb) from public, anon;
grant execute on function public.soundbox_heartbeat(uuid, uuid, jsonb) to authenticated;

-- A sale arrived: is a SoundBox of this business ready right now? `used` — any device seen in 7 days
-- (a business that never opened the SoundBox is not told about it).
create or replace function public.bot_soundbox_ready(p_key text, p_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return jsonb_build_object(
    'used', exists (select 1 from public.soundbox_devices d where d.workspace_id = p_workspace and d.last_seen > now() - interval '7 days'),
    'ready', (select count(*) from public.soundbox_devices d
              where d.workspace_id = p_workspace and d.visible and d.audio_unlocked and d.live and d.last_seen > now() - interval '90 seconds'));
end;
$$;
revoke all on function public.bot_soundbox_ready(text, uuid) from public, anon, authenticated;
grant execute on function public.bot_soundbox_ready(text, uuid) to anon, authenticated;

-- The offline watch (every minute): devices ready at some point in the last 16 hours and not yet alerted
-- for this absence, with whether another device of the business is ready. The rule (business hours,
-- 5 minutes, once per absence) is offlineAlertDue() in lib/soundbox.ts.
create or replace function public.bot_soundbox_watch(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'workspace_id', d.workspace_id, 'workspace', w.name, 'platform', d.platform,
      'visible', d.visible, 'audio_unlocked', d.audio_unlocked, 'live', d.live, 'last_seen', d.last_seen,
      'last_ready_at', d.last_ready_at, 'alerted_at', d.alerted_at,
      'other_ready', exists (select 1 from public.soundbox_devices o
                             where o.workspace_id = d.workspace_id and o.id <> d.id and o.visible and o.audio_unlocked and o.live
                               and o.last_seen > now() - interval '90 seconds')))
    from public.soundbox_devices d join public.workspaces w on w.id = d.workspace_id
    where d.last_ready_at > now() - interval '16 hours'
      and (d.alerted_at is null or d.alerted_at < d.last_ready_at)), '[]'::jsonb);
end;
$$;
revoke all on function public.bot_soundbox_watch(text) from public, anon, authenticated;
grant execute on function public.bot_soundbox_watch(text) to anon, authenticated;

-- Claims the alert for one absence (the same last-ready moment), so it is sent once even if two
-- dispatchers run.
create or replace function public.bot_soundbox_offline_claim(p_key text, p_device uuid, p_last_ready timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform public.require_bot(p_key);
  update public.soundbox_devices set alerted_at = now()
  where id = p_device and last_ready_at = p_last_ready and (alerted_at is null or alerted_at < last_ready_at);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.bot_soundbox_offline_claim(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.bot_soundbox_offline_claim(text, uuid, timestamptz) to anon, authenticated;
