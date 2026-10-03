-- NBC rate overrides (/admin and Telegram /setrate) are audited like gold overrides.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array['public.admin_log_action(text, text)', 'public.bot_admin_audit(text, bigint, text, text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('SET_RATE_OVERRIDE' in def) = 0 then
      def := replace(def, '(''SET_GOLD_OVERRIDE'', ''CLEAR_GOLD_OVERRIDE'')',
                          '(''SET_GOLD_OVERRIDE'', ''CLEAR_GOLD_OVERRIDE'', ''SET_RATE_OVERRIDE'', ''CLEAR_RATE_OVERRIDE'')');
      if position('SET_RATE_OVERRIDE' in def) = 0 then
        raise exception '%: allowed actions not found', f;
      end if;
      execute def;
    end if;
  end loop;
end $$;
