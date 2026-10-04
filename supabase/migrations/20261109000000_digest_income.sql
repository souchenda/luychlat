-- Weekly digest, version 2: income as well as spending (net savings, savings
-- rate), and an on-demand /digest for chats that switched the digest on.
-- One calculation serves both the Sunday job and /digest.
--
-- Per category (INCOME and EXPENSE) of the bot's workspace: this week and last
-- week, converted to USD at the workspace rate. Transfers between wallets are
-- their own type and never counted; debt principal and adjustments are left
-- out in the app (as in Reports). Other members' personal wallets in a family
-- workspace are not counted.

create or replace function public.digest_for(p_user_id uuid, p_chat_id bigint, p_language text, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  this_from timestamptz := (p_week_start::timestamp) at time zone 'Asia/Phnom_Penh';
  this_to   timestamptz := ((p_week_start + 7)::timestamp) at time zone 'Asia/Phnom_Penh';
  last_from timestamptz := ((p_week_start - 7)::timestamp) at time zone 'Asia/Phnom_Penh';
  link record;
  ws public.workspaces;
  rate numeric;
  cats jsonb;
  n integer;
begin
  select * into link from public.bot_chat_link(p_chat_id);
  if link.uid is distinct from p_user_id or link.ws is null then
    return null;
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = link.ws and m.user_id = p_user_id) then
    return null;
  end if;
  select * into ws from public.workspaces w where w.id = link.ws;
  rate := coalesce(ws.khr_per_usd, 4000);

  select count(*) filter (where x.transaction_date >= this_from),
         coalesce(jsonb_agg(jsonb_build_object('id', x.category_id, 'type', x.type, 'preset_key', x.preset_key, 'name', x.name, 'icon', x.icon,
                                               'this_usd', x.this_usd, 'last_usd', x.last_usd)) filter (where x.first), '[]'::jsonb)
    into n, cats
  from (
    select tx.transaction_date, tx.type, tx.category_id, c.preset_key, c.name, c.icon,
           row_number() over (partition by tx.type, tx.category_id order by tx.id) = 1 as first,
           sum(case when tx.transaction_date >= this_from then case when tx.currency = 'USD' then tx.amount else tx.amount / rate end else 0 end)
             over (partition by tx.type, tx.category_id) as this_usd,
           sum(case when tx.transaction_date < this_from then case when tx.currency = 'USD' then tx.amount else tx.amount / rate end else 0 end)
             over (partition by tx.type, tx.category_id) as last_usd
    from public.transactions tx
    join public.wallets_accounts wa on wa.id = tx.wallet_id
    left join public.categories c on c.id = tx.category_id
    where tx.workspace_id = link.ws and tx.type in ('INCOME', 'EXPENSE')
      and tx.transaction_date >= last_from and tx.transaction_date < this_to
      and (wa.visibility <> 'PERSONAL' or wa.owner_id is null or wa.owner_id = p_user_id)
  ) x;

  return jsonb_build_object(
    'user_id', p_user_id, 'chat_id', p_chat_id, 'language', p_language, 'tier', public.bot_tier(p_user_id),
    'workspace', ws.name, 'workspace_type', ws.type, 'currency', ws.currency_default, 'rate', rate,
    'entries', coalesce(n, 0), 'categories', cats
  );
end;
$$;
revoke all on function public.digest_for(uuid, bigint, text, date) from public, anon, authenticated;

-- The Sunday job: opted-in chats not yet sent this week, with entries this week.
create or replace function public.bot_weekly_digest(p_key text, p_week_start date, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out jsonb := '[]'::jsonb;
  l record;
  d jsonb;
begin
  perform public.require_bot(p_key);
  for l in
    select t.user_id, t.chat_id, t.language from public.telegram_links t
    where t.weekly_digest
      and not exists (select 1 from public.telegram_digest_sent s where s.user_id = t.user_id and s.week_start = p_week_start)
      and not exists (select 1 from public.account_controls c where c.user_id = t.user_id and c.suspended_at is not null)
    order by t.user_id
  loop
    exit when jsonb_array_length(out) >= least(coalesce(p_limit, 50), 200);
    d := public.digest_for(l.user_id, l.chat_id, l.language, p_week_start);
    continue when d is null or (d ->> 'entries')::integer = 0;
    out := out || jsonb_build_array(d);
  end loop;
  return out;
end;
$$;

-- /digest: this chat's digest now, or why not ('not_linked', 'off', 'suspended').
create or replace function public.bot_digest_for_chat(p_key text, p_chat_id bigint, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.telegram_links;
  d jsonb;
begin
  perform public.require_bot(p_key);
  select * into l from public.telegram_links t where t.chat_id = p_chat_id;
  if l.user_id is null then
    return jsonb_build_object('status', 'not_linked');
  end if;
  if exists (select 1 from public.account_controls c where c.user_id = l.user_id and c.suspended_at is not null) then
    return jsonb_build_object('status', 'suspended');
  end if;
  if not l.weekly_digest then
    return jsonb_build_object('status', 'off', 'language', l.language);
  end if;
  d := public.digest_for(l.user_id, l.chat_id, l.language, p_week_start);
  if d is null then
    return jsonb_build_object('status', 'not_linked', 'language', l.language);
  end if;
  return jsonb_build_object('status', 'ok', 'digest', d);
end;
$$;
revoke all on function public.bot_digest_for_chat(text, bigint, date) from public;
grant execute on function public.bot_digest_for_chat(text, bigint, date) to anon, authenticated;
