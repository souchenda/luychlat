-- The sale push strictly per device (founder, 24/10/2026 — Task #493: «it still rings on every device»). Each KHQR sale
-- was pushed to every notification subscription of the business's owner and members — 9 browsers and phones for the
-- founder (PCs, iPhones, a Mac, Androids) — whatever each device's own SoundBox or chime switch said. From now on a
-- subscription rings for sales only when its own device says so: the SoundBox or the payment chime switched on there
-- (PaymentChimeListener → set_sale_push, on every launch and every switch). Off by default, every existing row off: a
-- device whose switch is on turns its own row back on at its next launch.
alter table public.push_subscriptions add column if not exists sale_alerts boolean not null default false;
update public.push_subscriptions set sale_alerts = false where sale_alerts;

create or replace function public.set_sale_push(p_endpoint text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  update public.push_subscriptions set sale_alerts = p_on where endpoint = p_endpoint and user_id = (select auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.set_sale_push(text, boolean) from public, anon;
grant execute on function public.set_sale_push(text, boolean) to authenticated;

create or replace function public.bot_soundbox_push_targets(p_key text, p_workspace_id uuid)
returns table(endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.sale_alerts
    and (
      s.user_id = (select w.user_id from public.workspaces w where w.id = p_workspace_id)
      or exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = s.user_id)
    )
    and not exists (select 1 from public.account_controls c where c.user_id = s.user_id and c.suspended_at is not null);
end $$;

select public.apply_security_gate();
