-- New-user alerts carry where the person heard of the app (founder, 17/10/2026):
-- «🎉 អ្នកប្រើប្រាស់ថ្មីបានចុះឈ្មោះ៖ … · ស្គាល់តាម៖ Facebook». The answer is asked right after signing up, so an
-- alert waits up to 10 minutes for it, then goes anyway («មិនទាន់ឆ្លើយ») — a signup is never held back.
drop function if exists public.bot_signup_alerts_pending(text);
create function public.bot_signup_alerts_pending(p_key text)
returns table(user_id uuid, email text, provider text, created_at timestamptz, total_members bigint, display_name text, acquisition_source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
    select u.id, u.email::text,
      case
        when public.is_phone_login_email(u.email) then 'phone'
        else coalesce(u.raw_app_meta_data ->> 'provider', 'email')
      end,
      u.created_at,
      (select count(*) from auth.users),
      pr.display_name,
      pp.acquisition_source
    from public.signup_alerts a
    join auth.users u on u.id = a.user_id
    left join public.profiles pr on pr.id = a.user_id
    left join public.profile_private pp on pp.user_id = a.user_id
    where a.sent_at is null and a.created_at > now() - interval '2 days'
      and (pp.acquisition_source is not null or a.created_at < now() - interval '10 minutes')
    order by a.created_at
    limit 20;
end;
$$;
revoke all on function public.bot_signup_alerts_pending(text) from public, anon, authenticated;
grant execute on function public.bot_signup_alerts_pending(text) to anon, authenticated;
