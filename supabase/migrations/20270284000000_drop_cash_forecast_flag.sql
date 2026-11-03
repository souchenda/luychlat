-- The 14-day forecast card is gone (founder, 3/11/2026: «not a smart feature — it only gathers what other places show»).
-- Its flag row goes too, so Admin › Super does not list a feature that no longer exists. Data only, no schema change.
delete from public.feature_flags where key = 'cash_forecast';
