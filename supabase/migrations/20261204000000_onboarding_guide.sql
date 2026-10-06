-- First-time welcome guide: once seen (finished or skipped) it never opens by
-- itself again — remembered on the device and here, so a new phone knows too.
alter table public.profile_private add column if not exists has_seen_onboarding_guide boolean not null default false;
