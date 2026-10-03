-- Weekly spending digest in Telegram (Sunday evening), opt-in per user.
--
-- The bot never shows finances unless asked: a digest puts weekly totals in
-- the chat, so it is OFF by default and the user switches it on in
-- Settings › Telegram (with a warning). PRO / ULTRA get the full digest;
-- FREE gets a teaser without amounts. The server receives per-category sums
-- of the bot's workspace for this week and last week — never transactions.

alter table public.telegram_links add column if not exists weekly_digest boolean not null default false;
grant update (weekly_digest) on public.telegram_links to authenticated;

create table if not exists public.telegram_digest_sent (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.telegram_digest_sent enable row level security;
revoke all on public.telegram_digest_sent from anon, authenticated;

-- Opted-in chats not yet sent this week, with spending of the week starting
-- p_week_start (Monday, Cambodia time) and of the week before, by category.
-- Only chats with at least one expense this week are returned.
create or replace function public.bot_weekly_digest(p_key text, p_week_start date, p_limit integer default 50)
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
  out jsonb := '[]'::jsonb;
  l record;
  link record;
  ws public.workspaces;
  rate numeric;
  cats jsonb;
  n integer;
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
    select * into link from public.bot_chat_link(l.chat_id);
    continue when link.uid is distinct from l.user_id or link.ws is null;
    continue when not exists (select 1 from public.workspace_members m where m.workspace_id = link.ws and m.user_id = l.user_id);
    select * into ws from public.workspaces w where w.id = link.ws;
    rate := coalesce(ws.khr_per_usd, 4000);

    -- Expenses from wallets this member can see (not other members' personal wallets).
    select count(*) filter (where x.transaction_date >= this_from),
           coalesce(jsonb_agg(jsonb_build_object('id', x.category_id, 'preset_key', x.preset_key, 'name', x.name, 'icon', x.icon,
                                                 'this_usd', x.this_usd, 'last_usd', x.last_usd)) filter (where x.first), '[]'::jsonb)
      into n, cats
    from (
      select tx.transaction_date, tx.category_id, c.preset_key, c.name, c.icon,
             row_number() over (partition by tx.category_id order by tx.id) = 1 as first,
             sum(case when tx.transaction_date >= this_from then case when tx.currency = 'USD' then tx.amount else tx.amount / rate end else 0 end) over (partition by tx.category_id) as this_usd,
             sum(case when tx.transaction_date < this_from then case when tx.currency = 'USD' then tx.amount else tx.amount / rate end else 0 end) over (partition by tx.category_id) as last_usd
      from public.transactions tx
      join public.wallets_accounts wa on wa.id = tx.wallet_id
      left join public.categories c on c.id = tx.category_id
      where tx.workspace_id = link.ws and tx.type = 'EXPENSE'
        and tx.transaction_date >= last_from and tx.transaction_date < this_to
        and (wa.visibility <> 'PERSONAL' or wa.owner_id is null or wa.owner_id = l.user_id)
    ) x;
    continue when coalesce(n, 0) = 0;

    out := out || jsonb_build_array(jsonb_build_object(
      'user_id', l.user_id, 'chat_id', l.chat_id, 'language', l.language, 'tier', public.bot_tier(l.user_id),
      'workspace', ws.name, 'workspace_type', ws.type, 'currency', ws.currency_default, 'rate', rate,
      'entries', n, 'categories', cats
    ));
  end loop;
  return out;
end;
$$;
revoke all on function public.bot_weekly_digest(text, date, integer) from public;
grant execute on function public.bot_weekly_digest(text, date, integer) to anon, authenticated;

create or replace function public.bot_mark_digest_sent(p_key text, p_user_id uuid, p_week_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_bot(p_key);
  insert into public.telegram_digest_sent (user_id, week_start) values (p_user_id, p_week_start) on conflict do nothing;
  delete from public.telegram_digest_sent where week_start < current_date - 120;
end;
$$;
revoke all on function public.bot_mark_digest_sent(text, uuid, date) from public;
grant execute on function public.bot_mark_digest_sent(text, uuid, date) to anon, authenticated;

select public.apply_security_gate();
