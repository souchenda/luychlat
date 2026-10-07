-- Fuel & gas prices are entered by an admin (/setfuel, Admin › Fuel prices) and
-- the bulletin always shows them. Market syncs rewrite the whole market_live
-- record from what they read first; if that read ever failed, the admin's
-- prices were silently dropped. bot_set_market now keeps the stored fuel when
-- a write carries none (a write with fuel replaces it, as before).

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
  on conflict (key) do update
    set value = case
                  when jsonb_typeof(excluded.value -> 'fuel') = 'object' or jsonb_typeof(public.app_settings.value -> 'fuel') <> 'object'
                    then excluded.value
                  else excluded.value || jsonb_build_object('fuel', public.app_settings.value -> 'fuel')
                end,
        updated_at = now();
end;
$$;
