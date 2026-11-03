-- 🎤 Speak an entry in the app (founder, 3/11/2026): the mic in the entry sheet sends a short voice note to
-- /api/voice-entry, which answers with the words heard (the bot's engine) for the sheet to fill — nothing is saved
-- until the person taps Save. ADMIN_ONLY while the founder and staff test it; PUBLIC from Admin › Super.
insert into public.feature_flags (key, status) values ('voice_entry', 'ADMIN_ONLY') on conflict (key) do nothing;
