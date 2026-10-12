-- «🌐 ផ្សេងៗ (Other)» on the first-visit question (founder, 12/10/2026): people also find the app on
-- TikTok, YouTube, shop posters, events… — they type it, and it is kept as «other: <text>» (trimmed,
-- lower-case Latin, 1–60 characters). The admin overview groups those answers so new channels show.

alter table public.profile_private drop constraint if exists profile_private_acquisition_source_check;
alter table public.profile_private
  add constraint profile_private_acquisition_source_check
  check (
    acquisition_source is null
    or acquisition_source in ('facebook', 'telegram', 'referral', 'organic_search')
    or (acquisition_source ~ '^other: \S' and char_length(acquisition_source) <= 67)
  );

create or replace function public.admin_acquisition_sources()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  others jsonb;
begin
  perform public.require_admin();
  with real_users as (
    select u.id, u.created_at, pp.acquisition_source as src
    from auth.users u
    left join public.profile_private pp on pp.user_id = u.id
    left join public.account_controls c on c.user_id = u.id
    where not coalesce(c.is_test, false)
  )
  select
    jsonb_build_object(
      'facebook', count(*) filter (where src = 'facebook'),
      'telegram', count(*) filter (where src = 'telegram'),
      'referral', count(*) filter (where src = 'referral'),
      'organic_search', count(*) filter (where src = 'organic_search'),
      'other', count(*) filter (where src like 'other: %'),
      'unknown', count(*) filter (where src is null),
      'total', count(*),
      'last_30_days', jsonb_build_object(
        'facebook', count(*) filter (where src = 'facebook' and created_at > now() - interval '30 days'),
        'telegram', count(*) filter (where src = 'telegram' and created_at > now() - interval '30 days'),
        'referral', count(*) filter (where src = 'referral' and created_at > now() - interval '30 days'),
        'organic_search', count(*) filter (where src = 'organic_search' and created_at > now() - interval '30 days'),
        'other', count(*) filter (where src like 'other: %' and created_at > now() - interval '30 days'),
        'unknown', count(*) filter (where src is null and created_at > now() - interval '30 days')
      )
    )
  into result
  from real_users;

  -- The typed answers, grouped (the same words count together), most frequent first.
  with real_users as (
    select pp.acquisition_source as src
    from auth.users u
    join public.profile_private pp on pp.user_id = u.id
    left join public.account_controls c on c.user_id = u.id
    where not coalesce(c.is_test, false) and pp.acquisition_source like 'other: %'
  ),
  grouped as (
    select substr(src, 8) as label, count(*) as n from real_users group by substr(src, 8)
  )
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label), '[]'::jsonb)
  into others
  from (select * from grouped order by n desc, label limit 30) g;

  return result || jsonb_build_object('other_sources', others);
end;
$$;
revoke all on function public.admin_acquisition_sources() from public, anon;
grant execute on function public.admin_acquisition_sources() to authenticated;
