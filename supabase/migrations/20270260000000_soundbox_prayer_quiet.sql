-- The SoundBox quiet during the prayer, for the phone's native feed (founder, 26/10/2026 — Task #506, Phase 1): the
-- SoundBox page sends this device's quiet spans (15 / 20 min after each Adhan, 40 after Dhuhr on Friday — computed on the
-- device from its own prayer place, only when its «ស្ងាត់ SoundBox អំឡុងពេលសឡាត» switch is on); /api/soundbox/feed holds
-- the sales during a span and plays one catch-up after it, once (quiet_caught_to). Read and written by the server only —
-- like native_token_hash, never selectable by members (the column grants of 20270253000000 stay as they are).
alter table public.soundbox_devices add column if not exists quiet_spans jsonb;
alter table public.soundbox_devices add column if not exists quiet_caught_to timestamptz;

select public.apply_security_gate();
