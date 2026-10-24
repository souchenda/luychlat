-- The Adhan strictly per device (founder, 24/10/2026 — Task #488: at Dhuhr the Adhan rang on every phone). The server's
-- prayer push was on by default for every browser that ever subscribed to notifications (bills, reminders…), whatever
-- the prayer switch said on that device. From now on a new subscription starts OFF, and each device sets its own row to
-- its own switch on every launch (PrayerAlertScheduler → set_prayer_push): the Oppo's «on» never reaches the Samsung.
alter table public.push_subscriptions alter column prayer_alerts set default false;
-- Every existing row off too: each was «on» by the old default, not by its device's switch. A device whose switch is on
-- turns its own row back on at its next launch; a forgotten browser (an old laptop) never rings again.
update public.push_subscriptions set prayer_alerts = false where prayer_alerts;

select public.apply_security_gate();
