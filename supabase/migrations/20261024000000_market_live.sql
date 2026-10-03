-- Live market rates, fetched by the server every 30 minutes and readable by
-- every signed-in user (app_settings "market_live", existing read policy):
--   - NBC official exchange rates (National Bank of Cambodia, via Frankfurter),
--   - international gold / platinum spot ($/oz) and the reference price per
--     damlung for each purity (spot × 1.20565 × purity).
-- The server has no master key: like the bot, it writes through a function
-- that checks the key derived from TELEGRAM_BOT_TOKEN. Admin-entered gold
-- rates ("gold_rates") stay as the manual override for local shop prices.

create or replace function public.bot_set_market(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 20000 then
    raise exception 'invalid market data' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('market_live', p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- Daily server jobs (e.g. the 08:00 community bulletin): true for the first
-- caller of the day only, so a restart or a second instance never repeats it.
create table if not exists public.bot_daily_runs (
  job text not null check (char_length(job) between 1 and 40),
  day date not null,
  ran_at timestamptz not null default now(),
  primary key (job, day)
);
alter table public.bot_daily_runs enable row level security;
revoke all on public.bot_daily_runs from anon, authenticated;

create or replace function public.bot_claim_daily(p_key text, p_job text, p_day date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_bot(p_key);
  insert into public.bot_daily_runs (job, day) values (p_job, p_day) on conflict do nothing;
  get diagnostics n = row_count;
  delete from public.bot_daily_runs where day < current_date - 60;
  return n > 0;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bot_set_market(text, jsonb)', 'public.bot_claim_daily(text, text, date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
