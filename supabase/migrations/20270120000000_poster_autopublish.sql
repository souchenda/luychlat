-- Festival posters published on their own at a set time (Pchum Ben: 10/10/2026 07:00).
-- 1) bot_system_audit also takes AUTO_POSTER_BROADCAST.
-- 2) bot_release_daily: a poster broadcast that failed gives its "once" claim back, so the
--    next minute (or an admin's /poster button) can try again. Posters only.

create or replace function public.bot_system_audit(p_key text, p_action text, p_note text, p_ref text default null, p_metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_action not in ('AUTO_SET_FUEL_PRICES', 'AUTO_POSTER_BROADCAST') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  perform public.audit(p_action, null, concat_ws(' · ', p_note, 'automatic'), p_ref, null, p_metadata);
end;
$$;
revoke all on function public.bot_system_audit(text, text, text, text, jsonb) from public;
grant execute on function public.bot_system_audit(text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.bot_release_daily(p_key text, p_job text, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_job !~ '^poster-[a-z]+$' then
    raise exception 'invalid job' using errcode = '22023';
  end if;
  delete from public.bot_daily_runs where job = p_job and day = p_day;
end;
$$;
revoke all on function public.bot_release_daily(text, text, date) from public;
grant execute on function public.bot_release_daily(text, text, date) to anon, authenticated;

select public.apply_security_gate();
