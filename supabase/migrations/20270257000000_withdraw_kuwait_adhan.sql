-- The Kuwait Adhan withdrawn before the Google Play launch (founder, 25/10/2026 — Task #499: no licensing or copyright
-- doubt; licensed popular voices may be negotiated later). The recording uploaded on 19/10/2026 as «អាហ្សានផ្លូវការ
-- អេប លុយឆ្លាត» (Kuwait Adhan · Ahmad At-Trablsy) is no longer offered to anyone: inactive, so the app's list, the
-- prayer alerts and the Telegram bot (bot_adhan_tracks) skip it. The app-wide default becomes the bundled CC0 recording
-- «អាហ្សានល្បឿនធម្មជាតិ» (Wikimedia Commons, CC0 1.0 — the same file the Android app already plays natively); no Fajr
-- default (no licensed Fajr recording yet: Fajr plays the regular one). A phone that had picked the withdrawn one falls
-- back to the default (resolvePreset). The row is kept, with the reason, never deleted.
update public.adhan_presets
   set active = false,
       rights_note = left(concat_ws(' · ', rights_note, 'Withdrawn 25/10/2026 (Task #499): dropped before the Play Store launch to avoid licensing doubt'), 500)
 where id = 'a96d61e5-8eb0-4c65-8f8a-9dd522d6809f';

update public.app_settings
   set value = jsonb_build_object('regular', 'commons-cc0-natural', 'fajr', null), updated_at = now()
 where key = 'adhan_defaults'
   and (value->>'regular' = 'g:a96d61e5-8eb0-4c65-8f8a-9dd522d6809f' or value->>'fajr' = 'g:a96d61e5-8eb0-4c65-8f8a-9dd522d6809f');
