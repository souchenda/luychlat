-- /bills in the bot: the chat's workspace's active bills (due date, amount, paid until) and fixed
-- deposit maturities, for the overview (src/lib/bot/bills-overview.ts). Read-only.
create or replace function public.bot_bills_overview(p_key text, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null or link.ws is null then return jsonb_build_object('status', 'not_linked'); end if;
  return jsonb_build_object(
    'status', 'ok',
    'workspace', (select w.name from public.workspaces w where w.id = link.ws),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', b.title, 'kind', b.kind, 'amount', b.amount, 'currency', b.currency,
        'due', public.bill_next_due(b), 'paid_until', b.paid_until) order by public.bill_next_due(b))
      from public.recurring_bills b
      where b.workspace_id = link.ws and b.is_active), '[]'::jsonb));
end;
$$;
revoke all on function public.bot_bills_overview(text, bigint) from public;
grant execute on function public.bot_bills_overview(text, bigint) to anon, authenticated;
