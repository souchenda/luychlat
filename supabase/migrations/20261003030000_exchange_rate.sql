-- ===========================================================================
-- Exchange rate (KHR per 1 USD) saved in the database, per workspace, so it
-- is the same on every device and survives clearing the browser. Before, it
-- lived only in each browser's local storage (and showed the 4,100 default
-- on any device where it was never set).
--
-- null = not set yet: the app uses the default (4,000). set_exchange_rate()
-- applies the user's rate to every workspace they own (Personal, Business,
-- their Family); family members see the owner's rate there.
-- Idempotent: safe to re-run.
-- ===========================================================================
alter table public.workspaces
  add column if not exists khr_per_usd numeric(8, 2);
alter table public.workspaces
  drop constraint if exists workspaces_khr_per_usd_range,
  add constraint workspaces_khr_per_usd_range check (khr_per_usd is null or khr_per_usd between 1000 and 10000);

create or replace function public.set_exchange_rate(p_rate numeric)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  changed integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_rate is null or p_rate < 1000 or p_rate > 10000 then
    raise exception 'rate must be between 1000 and 10000' using errcode = '22023';
  end if;
  update public.workspaces set khr_per_usd = round(p_rate) where user_id = uid;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.set_exchange_rate(numeric) from public, anon;
grant execute on function public.set_exchange_rate(numeric) to authenticated;
