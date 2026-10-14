-- SoundBox counter phones right now (read-only), from their heartbeat (every minute while /soundbox is open).
--   ssh luychlat-prod "sh /tmp/q.sh" < scripts/soundbox-devices.sql
-- ready = page shown + sound unlocked + live connection + heard from within 90 s.
-- wake: on = the screen is kept on · unsupported / denied = the phone's own Auto-Lock decides.
-- (Battery level isn't reported — browsers no longer expose it on iPhone.)
select d.platform, d.visible, d.audio_unlocked, d.live, d.wake,
  (d.visible and d.audio_unlocked and d.live and d.last_seen > now() - interval '90 seconds') as ready,
  round(extract(epoch from now() - d.last_seen)) as secs_since_heartbeat,
  d.last_seen at time zone 'Asia/Phnom_Penh' as last_seen,
  d.last_ready_at at time zone 'Asia/Phnom_Penh' as last_ready,
  d.alerted_at at time zone 'Asia/Phnom_Penh' as offline_alert_sent,
  w.name as business, d.created_at at time zone 'Asia/Phnom_Penh' as first_seen
from public.soundbox_devices d join public.workspaces w on w.id = d.workspace_id
order by d.last_seen desc;
