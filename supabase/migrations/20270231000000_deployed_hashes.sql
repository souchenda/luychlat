-- The commits deployed on a Cambodian day (founder, 20/10/2026 — the Daily Task Scorecard in the nightly report): read
-- by the bot to match ROADMAP.md items to today's work. Read-only; the bot key only.
create or replace function public.bot_deployed_hashes(p_key text, p_day date)
returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_bot(p_key);
  return coalesce((select array_agg(c.hash) from public.dev_changelog c
                    where (c.deployed_at at time zone 'Asia/Phnom_Penh')::date = p_day), '{}');
end $$;
revoke all on function public.bot_deployed_hashes(text, date) from public, anon, authenticated;
grant execute on function public.bot_deployed_hashes(text, date) to anon, authenticated;
