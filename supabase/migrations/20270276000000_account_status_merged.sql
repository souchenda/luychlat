-- «My account status» answers every gate again (found 29/10/2026 with the demo account: suspended / 2FA required by an
-- admin, yet the app opened and every save said only «មានបញ្ហា»). 20261031 (admin console) returned suspended,
-- suspended_reason and require_2fa for AccountGate (components/security/mfa-gate.tsx); 20261203 (dormant accounts)
-- replaced the function with status and telegram only for DormantGate — so the «account suspended» and «set up 2FA»
-- screens never showed while the database refused the data (account_ok). One function, all five keys.
create or replace function public.my_account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'suspended', coalesce(c.suspended_at is not null, false),
    'suspended_reason', c.suspended_reason,
    'require_2fa', coalesce(c.require_2fa, false),
    'status', coalesce((select p.account_status from public.profiles p where p.id = (select auth.uid())), 'ACTIVE'),
    'telegram', exists (select 1 from public.telegram_links l where l.user_id = (select auth.uid()))
  )
  from (select 1) one
  left join public.account_controls c on c.user_id = (select auth.uid());
$$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;
