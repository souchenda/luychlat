-- Platinum / white gold (ប្លាទីន) grades and the jewelry type of gold items.
-- Idempotent.
--   grade (PLATINUM only): P75 = ទឹក 75 (18K / 750), P70 = ទឹក 70,
--   P585 = ទឹក 58.5 (14K / 585), PT950, PT900
--   jewelry_type: ring, necklace, bracelet, earrings, pendant, bar, other

alter table public.gold_holdings add column if not exists grade text;
alter table public.gold_holdings add column if not exists jewelry_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gold_holdings_grade_check') then
    alter table public.gold_holdings add constraint gold_holdings_grade_check
      check (grade is null or (kind = 'PLATINUM' and grade in ('P75', 'P70', 'P585', 'PT950', 'PT900')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gold_holdings_jewelry_type_check') then
    alter table public.gold_holdings add constraint gold_holdings_jewelry_type_check
      check (jewelry_type is null or jewelry_type in ('RING', 'NECKLACE', 'BRACELET', 'EARRINGS', 'PENDANT', 'BAR', 'OTHER'));
  end if;
end $$;

grant update (grade, jewelry_type) on public.gold_holdings to authenticated;

-- Rates may now also be set per platinum grade (USD per damlung).
create or replace function public.admin_set_gold_rates(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_value, '{}'::jsonb);
  k text;
begin
  perform public.require_admin();
  if jsonb_typeof(v) <> 'object' or length(v::text) > 1000 then
    raise exception 'invalid rates' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v) loop
    if k not in ('GOLD_BAR', 'GOLD_24K', 'GOLD_18K', 'PLATINUM',
                 'PLATINUM_P75', 'PLATINUM_P70', 'PLATINUM_P585', 'PLATINUM_PT950', 'PLATINUM_PT900') then
      raise exception 'unknown kind %', k using errcode = '22023';
    end if;
    if v ->> k is not null and not ((v ->> k) ~ '^[0-9]+(\.[0-9]+)?$' and (v ->> k)::numeric between 1 and 1000000) then
      raise exception 'invalid rate for %', k using errcode = '22023';
    end if;
  end loop;
  insert into public.app_settings (key, value, updated_at) values ('gold_rates', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
