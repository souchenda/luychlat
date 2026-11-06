-- Lighter event log writes (founder, 6/11/2026 — the Supabase Disk IO warning on the Free plan): every bot_log_event
-- also deleted the rows older than 30 days — one extra write on every line of the log. The clean-up now runs on about
-- one call in fifty; the table still never holds more than ~30 days (it is read 25 rows at a time). Additive only.
create or replace function public.bot_log_event(p_key text, p_level text, p_source text, p_message text, p_count integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.server_events (level, source, message, count)
  values (p_level, left(p_source, 40), left(coalesce(p_message, ''), 300), greatest(1, coalesce(p_count, 1)));
  if random() < 0.02 then
    delete from public.server_events where at < now() - interval '30 days';
  end if;
end;
$$;

select public.apply_security_gate();
