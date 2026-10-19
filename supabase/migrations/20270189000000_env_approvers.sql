-- TELEGRAM_APPROVER_IDS (founder, 19/10/2026): Telegram user ids in the server's environment (comma-separated, set on
-- the Droplet console) are co-approvers in «LCA Approval», beside the ones added with /addapprover. The server syncs
-- the list at start: ids in it become active (source 'env'); env ids taken out of it stop. A command-added approver is
-- never touched by the sync. An env approver decides as the app account their Telegram is linked to (/start link).

alter table public.content_approvers add column if not exists source text not null default 'command';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_approvers_source_check') then
    alter table public.content_approvers add constraint content_approvers_source_check check (source in ('command', 'env'));
  end if;
end $$;

create or replace function public.bot_sync_env_approvers(p_key text, p_ids bigint[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  added int := 0;
  removed int := 0;
begin
  perform public.require_bot(p_key);
  insert into public.content_approvers (telegram_user_id, name, active, source)
  select distinct i, 'TELEGRAM_APPROVER_IDS', true, 'env' from unnest(coalesce(p_ids, '{}')) i where i > 0
  on conflict (telegram_user_id) do update set active = true
    where public.content_approvers.source = 'env' and not public.content_approvers.active;
  get diagnostics added = row_count;
  update public.content_approvers a set active = false
   where a.source = 'env' and a.active and not (a.telegram_user_id = any (coalesce(p_ids, '{}')));
  get diagnostics removed = row_count;
  if added + removed > 0 then
    perform public.audit('APPROVERS_ENV_SYNC', null, 'TELEGRAM_APPROVER_IDS: ' || added || ' on, ' || removed || ' off', null, null);
  end if;
  return jsonb_build_object('added', added, 'removed', removed);
end $$;
revoke all on function public.bot_sync_env_approvers(text, bigint[]) from public, anon, authenticated;
grant execute on function public.bot_sync_env_approvers(text, bigint[]) to anon, authenticated;
