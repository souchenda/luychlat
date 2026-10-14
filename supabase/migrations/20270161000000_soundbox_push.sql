-- SoundBox with the phone locked (founder, 14/10/2026): each customer payment is also a phone push
-- («💰 ទទួលបានប្រាក់ 50,000 ៛») to the devices of the people who see that business's sales — its owner
-- and members — so the merchant is alerted even when the browser is asleep. Suspended accounts never.

create or replace function public.bot_soundbox_push_targets(p_key text, p_workspace_id uuid)
returns table (endpoint text, p256dh text, auth text)
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
  where (
      s.user_id = (select w.user_id from public.workspaces w where w.id = p_workspace_id)
      or exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = s.user_id)
    )
    and not exists (select 1 from public.account_controls c where c.user_id = s.user_id and c.suspended_at is not null);
end;
$$;
revoke all on function public.bot_soundbox_push_targets(text, uuid) from public;
grant execute on function public.bot_soundbox_push_targets(text, uuid) to anon, authenticated;
