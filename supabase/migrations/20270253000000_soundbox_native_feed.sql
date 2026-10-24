-- The SoundBox announced by the phone itself (founder, 24/10/2026 — Task #487: the DL MEAT SUPPLY counter phone, a
-- Huawei, froze the app's WebView with the screen off — no heartbeat from 09:30, the 4,893,000 ៛ sale of 09:45 never
-- announced). From APK 1.9 the SoundBox's foreground service asks the server for new sales every few seconds and plays
-- them natively. It reads them with a per-device token, made by the signed-in SoundBox page and kept here only as its
-- SHA-256 (src/app/api/soundbox/feed/token); null = no native feed for this device (the page turned the SoundBox off).
alter table public.soundbox_devices add column if not exists native_token_hash text
  check (native_token_hash is null or native_token_hash ~ '^[0-9a-f]{64}$');

-- Never readable by the members (the device list stays as it was): only the service role reads it.
revoke select on public.soundbox_devices from authenticated;
grant select (id, user_id, workspace_id, platform, visible, audio_unlocked, live, wake, last_seen, last_ready_at, alerted_at, created_at)
  on public.soundbox_devices to authenticated;

select public.apply_security_gate();
