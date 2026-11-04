-- The helpline chat button on every screen (founder, 4/11/2026 — src/components/helpline/helpline-chat.tsx): staff first,
-- then everyone from Admin › Super. Additive only.
insert into public.feature_flags (key, status) values ('helpline', 'ADMIN_ONLY') on conflict (key) do nothing;
