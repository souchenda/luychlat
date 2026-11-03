-- 💡 The 14-day cash-flow forecast on Home (founder, 3/11/2026 — src/lib/cash-forecast.ts): staff first, then everyone
-- from Admin › Super. Additive only.
insert into public.feature_flags (key, status) values ('cash_forecast', 'ADMIN_ONLY') on conflict (key) do nothing;
