-- The admin's sign-up alert shows the new member's name (sign-up now asks for it
-- and the signup trigger stores it as the profile's display name). Adds a
-- display_name column, so the function is dropped and recreated.

drop function if exists public.bot_signup_alerts_pending(text);

create function public.bot_signup_alerts_pending(p_key text)
returns table (user_id uuid, email text, provider text, created_at timestamptz, total_members bigint, display_name text)
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
      pr.display_name
    from public.signup_alerts a
    join auth.users u on u.id = a.user_id
    left join public.profiles pr on pr.id = a.user_id
    where a.sent_at is null and a.created_at > now() - interval '2 days'
    order by a.created_at
    limit 20;
end;
$$;

revoke all on function public.bot_signup_alerts_pending(text) from public;
grant execute on function public.bot_signup_alerts_pending(text) to anon, authenticated;
