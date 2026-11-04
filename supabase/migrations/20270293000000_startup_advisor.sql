-- The startup advisor (founder, 4/11/2026 — docs/startup-advisor.md): App Luy Chlat as a business, for the super admin
-- only. His costs (he records none elsewhere yet — a list he fills in, the usual ones named with no amount, never guessed),
-- his own monthly pay and his profit target; and the paying users at the end of each past month, counted the way the
-- business metrics count them (not staff), from the paid payments and their plan's period. Additive only.

create table if not exists public.startup_settings (
  id              smallint primary key default 1 check (id = 1),
  -- [{ "name": "DigitalOcean Droplet", "usd": 24, "kind": "FIXED" | "PER_PAYING" }]
  costs           jsonb not null default '[]'::jsonb check (jsonb_typeof(costs) = 'array' and jsonb_array_length(costs) <= 40),
  founder_pay_usd numeric(12, 2) not null default 0 check (founder_pay_usd >= 0),
  profit_target   numeric(4, 2) not null default 0.2 check (profit_target between 0 and 0.9),
  updated_at      timestamptz not null default now()
);
alter table public.startup_settings enable row level security;
revoke all on public.startup_settings from anon, authenticated;
grant select, insert, update on public.startup_settings to authenticated;
drop policy if exists startup_settings_super on public.startup_settings;
create policy startup_settings_super on public.startup_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The usual costs, named with no amount: he fills in what he really pays (never a guessed figure).
insert into public.startup_settings (id, costs) values (1, '[
  {"name": "DigitalOcean Droplet (server)", "usd": 0, "kind": "FIXED"},
  {"name": "Supabase (database)", "usd": 0, "kind": "FIXED"},
  {"name": "Domain luychlat.com / ibmserp.com", "usd": 0, "kind": "FIXED"},
  {"name": "Google Play (one-time $25 ÷ 12)", "usd": 0, "kind": "FIXED"},
  {"name": "Gemini / AI per paying user", "usd": 0, "kind": "PER_PAYING"}
]'::jsonb) on conflict (id) do nothing;

-- Paying users at the end of each of the last p_months months (oldest first): a non-staff account with a PAID payment whose
-- plan period covers that moment. The current month ends now.
create or replace function public.startup_paying_history(p_months int default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('month', to_char(m.at at time zone 'Asia/Phnom_Penh', 'YYYY-MM'), 'paying', (
      select count(distinct p.user_id) from public.payments p
      join public.plans pl on pl.code = p.plan_code
      where p.status = 'PAID' and p.plan_code <> 'FREE' and not public.is_staff_user(p.user_id)
        and coalesce(p.reviewed_at, p.created_at) <= m.at
        and coalesce(p.reviewed_at, p.created_at) + make_interval(days => coalesce(pl.period_days, 30)) > m.at
    )) order by m.at)
    from (
      select least(now(), (date_trunc('month', now() at time zone 'Asia/Phnom_Penh') - make_interval(months => g) + interval '1 month' - interval '1 second') at time zone 'Asia/Phnom_Penh') as at
      from generate_series(least(greatest(coalesce(p_months, 6), 2), 24) - 1, 0, -1) as g
    ) m
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.startup_paying_history(int) from public, anon;
grant execute on function public.startup_paying_history(int) to authenticated;

select public.apply_security_gate();
