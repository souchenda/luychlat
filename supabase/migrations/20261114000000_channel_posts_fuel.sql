-- Community channel: remember the last market post so the next one replaces it
-- (deleteMessage), and audit fuel-price overrides (MoC rates entered by an admin).

-- Small server-side values the bot keeps between restarts (only listed names).
create or replace function public.bot_kv_get(p_key text, p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_name not in ('community_posts') then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  return (select s.value from public.app_settings s where s.key = 'bot:' || p_name);
end;
$$;
revoke all on function public.bot_kv_get(text, text) from public;
grant execute on function public.bot_kv_get(text, text) to anon, authenticated;

create or replace function public.bot_kv_set(p_key text, p_name text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  if p_name not in ('community_posts') or pg_column_size(p_value) > 2000 then
    raise exception 'invalid value' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('bot:' || p_name, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.bot_kv_set(text, text, jsonb) from public;
grant execute on function public.bot_kv_set(text, text, jsonb) to anon, authenticated;

-- Fuel overrides are audited like gold and NBC overrides.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array['public.admin_log_action(text, text)', 'public.bot_admin_audit(text, bigint, text, text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('SET_FUEL_PRICES' in def) = 0 then
      def := replace(def, '''SET_RATE_OVERRIDE'', ''CLEAR_RATE_OVERRIDE'')',
                          '''SET_RATE_OVERRIDE'', ''CLEAR_RATE_OVERRIDE'', ''SET_FUEL_PRICES'')');
      if position('SET_FUEL_PRICES' in def) = 0 then
        raise exception '%: allowed actions not found', f;
      end if;
      execute def;
    end if;
  end loop;
end $$;
