-- ===========================================================================
-- Brand: the English name is now "LuyChlat" (Khmer stays លុយឆ្លាត).
-- Several functions sign their Telegram messages "— លុយឆ្លាត · LuySmart";
-- rewrite them in place (same definition, grants and owner) instead of
-- copying their bodies here. Idempotent: once renamed, nothing matches.
-- Internal identifiers (table names, the "luysmart" AI provider value,
-- browser storage keys) are unchanged on purpose.
-- ===========================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%LuySmart%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'LuySmart', 'LuyChlat');
  end loop;
end
$$;
