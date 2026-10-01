-- Phase 6: Danger Zone "Reset All Data" for signed-in users.
-- Deletes the caller's financial data in one transaction and re-seeds the
-- default categories; workspaces and the account itself are kept. Receipt
-- files in Storage are removed by the client (Storage API) beforehand.

create or replace function public.reset_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Order matters: transactions reference wallets/categories/debts (NO ACTION),
  -- repayments cascade from transactions and debts.
  delete from public.notifications where workspace_id in (select id from public.workspaces where user_id = uid);
  delete from public.transactions where workspace_id in (select id from public.workspaces where user_id = uid);
  delete from public.debts where workspace_id in (select id from public.workspaces where user_id = uid);
  delete from public.wallets_accounts where workspace_id in (select id from public.workspaces where user_id = uid);
  delete from public.categories where workspace_id in (select id from public.workspaces where user_id = uid);
  delete from public.telegram_settings where user_id = uid;

  for ws in select id, type from public.workspaces where user_id = uid loop
    perform public.seed_default_categories(ws.id, ws.type);
  end loop;
end;
$$;
revoke all on function public.reset_my_data() from public, anon;
grant execute on function public.reset_my_data() to authenticated;
