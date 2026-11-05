-- The helpline on luychlat.com (founder, 5/11/2026 — src/app/api/helpline/site/route.ts): the website asks the server
-- whether the chat is open to everyone — the same «helpline» flag as the app (Admin › Super): PUBLIC shows it on the
-- website too; ADMIN_ONLY keeps it for the team's own test (luychlat.com/?helpline=test). Additive only.
create or replace function public.bot_helpline_site_on(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return coalesce((select f.status = 'PUBLIC' from public.feature_flags f where f.key = 'helpline'), false);
end;
$$;
revoke all on function public.bot_helpline_site_on(text) from public;
grant execute on function public.bot_helpline_site_on(text) to anon, authenticated;

select public.apply_security_gate();
