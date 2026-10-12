-- «តើបងបានស្គាល់ អេប លុយឆ្លាត តាមរយៈណាដែរ?» (founder, 12/10/2026): a one-tap question on a new
-- account's first visit — where they heard of the app. Kept in profile_private (owner-only; the
-- admins see only the counts). Skipping leaves it null, so the question comes back next visit
-- (within two weeks of signing up), as the Islamic Mode choice does.

alter table public.profile_private
  add column if not exists acquisition_source text,
  add column if not exists acquisition_at timestamptz;

alter table public.profile_private drop constraint if exists profile_private_acquisition_source_check;
alter table public.profile_private
  add constraint profile_private_acquisition_source_check
  check (acquisition_source is null or acquisition_source in ('facebook', 'telegram', 'referral', 'organic_search'));

-- Admin overview: how people found the app — real accounts only (test accounts left out); «unknown»
-- are those who never answered (older accounts, or skipped).
create or replace function public.admin_acquisition_sources()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'facebook', count(*) filter (where pp.acquisition_source = 'facebook'),
    'telegram', count(*) filter (where pp.acquisition_source = 'telegram'),
    'referral', count(*) filter (where pp.acquisition_source = 'referral'),
    'organic_search', count(*) filter (where pp.acquisition_source = 'organic_search'),
    'unknown', count(*) filter (where pp.acquisition_source is null),
    'total', count(*),
    'last_30_days', jsonb_build_object(
      'facebook', count(*) filter (where pp.acquisition_source = 'facebook' and u.created_at > now() - interval '30 days'),
      'telegram', count(*) filter (where pp.acquisition_source = 'telegram' and u.created_at > now() - interval '30 days'),
      'referral', count(*) filter (where pp.acquisition_source = 'referral' and u.created_at > now() - interval '30 days'),
      'organic_search', count(*) filter (where pp.acquisition_source = 'organic_search' and u.created_at > now() - interval '30 days'),
      'unknown', count(*) filter (where pp.acquisition_source is null and u.created_at > now() - interval '30 days')
    )
  ) into result
  from auth.users u
  left join public.profile_private pp on pp.user_id = u.id
  left join public.account_controls c on c.user_id = u.id
  where not coalesce(c.is_test, false);
  return result;
end;
$$;
revoke all on function public.admin_acquisition_sources() from public, anon;
grant execute on function public.admin_acquisition_sources() to authenticated;

select public.apply_security_gate();
