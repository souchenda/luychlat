-- The budget line an expense just crossed, for the bot (founder, 4/11/2026 — src/lib/budgets.ts budgetCrossing): the
-- category's monthly cap, what the month had spent in it before this entry and this entry, both in the cap's currency (riel
-- and dollars at the workspace's rate), for an expense of the current Cambodian month only. `numbers`: the chat's
-- «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» — the bot says the percentage only then (bot privacy). A member of the workspace only.
-- Read-only, additive.
create or replace function public.bot_budget_check(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  b public.budgets;
  v_rate numeric;
  v_month timestamptz;
  v_before numeric;
  v_added numeric;
  v_name text;
  v_numbers boolean;
begin
  perform public.require_bot(p_key);
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is null then
    return jsonb_build_object('status', 'none');
  end if;
  select * into t from public.transactions where id = p_tx_id and type = 'EXPENSE';
  if t.id is null or t.category_id is null
     or not exists (select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = link.uid) then
    return jsonb_build_object('status', 'none');
  end if;
  v_month := date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh';
  if t.transaction_date < v_month then
    return jsonb_build_object('status', 'none');
  end if;
  select * into b from public.budgets where workspace_id = t.workspace_id and category_id = t.category_id;
  if b.id is null then
    return jsonb_build_object('status', 'none');
  end if;
  select coalesce(w.khr_per_usd, 4000) into v_rate from public.workspaces w where w.id = t.workspace_id;
  select coalesce(sum(case when x.currency = b.currency then x.amount when b.currency = 'USD' then x.amount / v_rate else x.amount * v_rate end), 0)
  into v_before
  from public.transactions x
  where x.workspace_id = t.workspace_id and x.category_id = t.category_id and x.type = 'EXPENSE'
    and x.transaction_date >= v_month and x.id <> t.id;
  v_added := case when t.currency = b.currency then t.amount when b.currency = 'USD' then t.amount / v_rate else t.amount * v_rate end;
  select c.name into v_name from public.categories c where c.id = t.category_id;
  select coalesce(l.ai_numbers, false) into v_numbers from public.telegram_links l where l.chat_id = p_chat_id;
  return jsonb_build_object('status', 'ok', 'cap', b.amount, 'spent_before', v_before, 'added', v_added, 'category', v_name, 'numbers', coalesce(v_numbers, false));
end;
$$;

revoke all on function public.bot_budget_check(text, bigint, uuid) from public;
grant execute on function public.bot_budget_check(text, bigint, uuid) to anon, authenticated;

select public.apply_security_gate();
