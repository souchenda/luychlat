-- Zero-click slips (founder, 09/10): a slip whose payee the user has categorised before
-- (or an unmistakable café / restaurant / fuel station / mart) is saved at once, with
-- override buttons. user_merchant_memory keeps each user's choice per merchant and learns
-- from every category tap and override. Only the user's own entries made from their slip
-- photos can be re-categorised or deleted from the bot.

create table if not exists public.user_merchant_memory (
  user_id       uuid not null references auth.users (id) on delete cascade,
  merchant_name text not null check (char_length(merchant_name) between 3 and 80 and merchant_name = lower(merchant_name)),
  category_id   uuid not null references public.categories (id) on delete cascade,
  -- The slip button it came from ("coffee", "fuel"…): coffee and fuel carry a note tag on top of their category.
  choice        text check (choice is null or choice in ('food', 'coffee', 'fuel', 'shopping', 'home', 'other')),
  need_want     text check (need_want is null or need_want in ('NEED', 'WANT')),
  usage_count   integer not null default 1 check (usage_count > 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, merchant_name)
);
alter table public.user_merchant_memory enable row level security;
revoke all on public.user_merchant_memory from anon;
grant select, delete on public.user_merchant_memory to authenticated;
drop policy if exists merchant_memory_own on public.user_merchant_memory;
create policy merchant_memory_own on public.user_merchant_memory for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists merchant_memory_own_delete on public.user_merchant_memory;
create policy merchant_memory_own_delete on public.user_merchant_memory for delete to authenticated using (user_id = (select auth.uid()));

-- A. What this user chose last time for the merchant — only if that category is in the workspace the slip goes to.
create or replace function public.bot_merchant_recall(p_key text, p_chat_id bigint, p_merchant text, p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link record;
  m public.user_merchant_memory;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null then return null; end if;
  select x.* into m from public.user_merchant_memory x
  join public.categories c on c.id = x.category_id and c.workspace_id = p_workspace_id and c.type = 'EXPENSE'
  where x.user_id = link.uid and x.merchant_name = lower(btrim(p_merchant));
  if m.user_id is null then return null; end if;
  return jsonb_build_object('choice', m.choice, 'category_id', m.category_id, 'need_want', m.need_want, 'usage_count', m.usage_count);
end;
$$;

-- Learn (a tap on a category, an override): the latest choice wins, the count says how settled it is.
create or replace function public.bot_merchant_learn(p_key text, p_chat_id bigint, p_merchant text, p_category_id uuid, p_choice text, p_need_want text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  k text := lower(regexp_replace(btrim(coalesce(p_merchant, '')), '\s+', ' ', 'g'));
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or char_length(k) < 3 then return; end if;
  if not exists (
    select 1 from public.categories c join public.workspace_members m on m.workspace_id = c.workspace_id and m.user_id = link.uid
    where c.id = p_category_id and c.type = 'EXPENSE'
  ) then return; end if;
  insert into public.user_merchant_memory (user_id, merchant_name, category_id, choice, need_want)
  values (link.uid, left(k, 80), p_category_id, p_choice, case when p_need_want in ('NEED', 'WANT') then p_need_want end)
  on conflict (user_id, merchant_name) do update
    set usage_count = case when public.user_merchant_memory.category_id = excluded.category_id
                           and public.user_merchant_memory.choice is not distinct from excluded.choice
                      then public.user_merchant_memory.usage_count + 1 else 1 end,
        category_id = excluded.category_id, choice = excluded.choice,
        need_want = coalesce(excluded.need_want, public.user_merchant_memory.need_want), updated_at = now();
end;
$$;

-- An override on an auto-saved slip: its category (and the note tag of coffee / fuel), meal and Need / Want.
-- Only the user's own expense made from their slip photo (its receipt is <uid>/tg/…), within 30 days.
create or replace function public.bot_slip_recategorize(p_key text, p_chat_id bigint, p_tx_id uuid, p_category_id uuid,
  p_note_tag text, p_strip_tags text[], p_subcategory text, p_need_want text, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
  v_note text;
  tag text;
  v_meal text;
  mins integer;
  merchant text;
begin
  perform public.require_bot(p_key);
  -- p_subcategory: a meal, 'auto' (the meal of the payment's own time), or null (not food).
  if p_subcategory is not null and p_subcategory not in ('breakfast', 'lunch', 'dinner', 'snack', 'auto') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  if p_need_want is not null and p_need_want not in ('NEED', 'WANT') then raise exception 'invalid_tag' using errcode = '22023'; end if;
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select * into t from public.transactions
  where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '30 days'
    and receipt_url like link.uid::text || '/tg/%';
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  if not exists (select 1 from public.categories c where c.id = p_category_id and c.workspace_id = t.workspace_id and c.type = 'EXPENSE') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  -- The old choice's tag ("☕ កាហ្វេ/ភេសជ្ជៈ · …") comes off; the new one's goes on.
  v_note := coalesce(t.note, '');
  foreach tag in array coalesce(p_strip_tags, '{}') loop
    if v_note = tag then
      v_note := '';
    elsif left(v_note, char_length(tag) + 3) = tag || ' · ' then
      v_note := substr(v_note, char_length(tag) + 4);
    end if;
  end loop;
  if nullif(btrim(p_note_tag), '') is not null then v_note := concat_ws(' · ', btrim(p_note_tag), nullif(v_note, '')); end if;
  if p_subcategory = 'auto' then
    -- Breakfast 06:00–10:30, lunch 11:00–14:00, dinner 17:00–21:00 (Cambodia time), else a snack.
    mins := extract(hour from t.transaction_date at time zone 'Asia/Phnom_Penh')::integer * 60 + extract(minute from t.transaction_date at time zone 'Asia/Phnom_Penh')::integer;
    v_meal := case when mins between 360 and 630 then 'breakfast' when mins between 660 and 840 then 'lunch' when mins between 1020 and 1260 then 'dinner' else 'snack' end;
  else
    v_meal := p_subcategory;
  end if;
  update public.transactions
     set category_id = p_category_id, note = left(nullif(v_note, ''), 500),
         subcategory = v_meal, need_want = coalesce(p_need_want, need_want)
   where id = t.id
  returning * into t;
  -- Learn it: the merchant is the slip's payee in the note ("🧾 ABA → 360 DEGREE COFFEE (…)").
  merchant := btrim(substring(coalesce(t.note, '') from '→ ([^(·]+)'));
  if merchant is not null and char_length(merchant) >= 3 then
    perform public.bot_merchant_learn(p_key, p_chat_id, merchant, p_category_id, p_choice, p_need_want);
  end if;
  return jsonb_build_object('ok', true, 'note', t.note, 'need_want', t.need_want, 'subcategory', t.subcategory, 'merchant', merchant);
end;
$$;

-- 🗑️ on an auto-saved slip: removes that entry (the user's own, from their slip photo, within 30 days).
create or replace function public.bot_slip_delete(p_key text, p_chat_id bigint, p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  t public.transactions;
begin
  perform public.require_bot(p_key);
  link := public.bot_chat_link(p_chat_id);
  if link.uid is null or not link.enabled then raise exception 'commands_off' using errcode = 'P0001'; end if;
  select * into t from public.transactions
  where id = p_tx_id and created_by = link.uid and type = 'EXPENSE' and created_at > now() - interval '30 days'
    and receipt_url like link.uid::text || '/tg/%';
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  perform public.bot_act_as(link.uid);
  if not public.bot_ws_allowed(link.uid, link.ws, link.route_all, t.workspace_id) then raise exception 'not_writable' using errcode = '42501'; end if;
  delete from public.transactions where id = t.id;
  return jsonb_build_object('ok', true, 'amount', t.amount, 'currency', t.currency);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.bot_merchant_recall(text, bigint, text, uuid)',
    'public.bot_merchant_learn(text, bigint, text, uuid, text, text)',
    'public.bot_slip_recategorize(text, bigint, uuid, uuid, text, text[], text, text, text)',
    'public.bot_slip_delete(text, bigint, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
