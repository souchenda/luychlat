-- KHQR: the business is found by the RECEIVING account, not by a key per business (founder, 8/11/2026 —
-- «ធ្វើអីសាមញ្ញៗ»). AUTOBOK keeps its one key and sends the receiving account it read («***-**7387»); the
-- payment goes to the key owner's business whose wallet's account number ends with those 4 digits, and into
-- that very wallet. Adding a shop is then only: a wallet with its account number in that shop.
-- No match (or two businesses with the same ending and the key's business not one of them) → the key's own
-- business, as before — where a bank with no wallet is HELD and the owner asked, never booked by a guess.

create or replace function public.bot_khqr_ingest(p_key text, p_key_hash text, p_pay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.khqr_api_keys;
  result jsonb;
  ws_id uuid;
  last4 text := right(regexp_replace(coalesce(p_pay ->> 'receiving_account', ''), '\D', '', 'g'), 4);
  hits uuid[];
  wallet_id uuid;
  v_cur text := upper(btrim(coalesce(p_pay ->> 'currency', '')));
  pay jsonb := p_pay;
begin
  perform public.require_bot(p_key);
  select * into k from public.khqr_api_keys where key_hash = lower(coalesce(p_key_hash, ''));
  if k.workspace_id is null then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  -- The key acts as the business owner (who made it); suspended / removed owners stop working.
  if not exists (select 1 from public.workspaces w where w.id = k.workspace_id and w.user_id = k.created_by)
     or exists (select 1 from public.account_controls c where c.user_id = k.created_by and c.suspended_at is not null) then
    return jsonb_build_object('status', 'unauthorized');
  end if;
  update public.khqr_api_keys set last_used_at = now() where workspace_id = k.workspace_id;

  ws_id := k.workspace_id;
  if length(last4) = 4 then
    -- The owner's own open businesses with a wallet on that account.
    select array_agg(distinct x.workspace_id) into hits
    from public.wallets_accounts x join public.workspaces w on w.id = x.workspace_id
    where w.user_id = k.created_by and w.type = 'BUSINESS' and w.archived_at is null
      and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
      and right(regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g'), 4) = last4;
    if coalesce(cardinality(hits), 0) = 1 then
      ws_id := hits[1];
    end if;
    if ws_id = any (coalesce(hits, '{}')) then
      -- That account's wallet (in the payment's currency first).
      select x.id into wallet_id from public.wallets_accounts x
      where x.workspace_id = ws_id and x.archived_at is null and coalesce(x.kind::text, '') <> 'CREDIT_CARD'
        and right(regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g'), 4) = last4
      order by (x.currency::text = v_cur) desc, x.created_at
      limit 1;
      if wallet_id is not null and nullif(p_pay ->> 'wallet_id', '') is null then
        pay := p_pay || jsonb_build_object('wallet_id', wallet_id);
      end if;
    end if;
  end if;

  result := public.khqr_record(ws_id, k.created_by, pay);
  return result || jsonb_build_object('workspace_id', ws_id,
    'quiet', coalesce((select w.khqr_quiet from public.workspaces w where w.id = ws_id), false));
end;
$$;
