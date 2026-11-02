-- Sign-up and sign-in through @luychlat_bot (founder, 30/10/2026 — src/lib/telegram-signup.ts): the person shares their
-- own Telegram number (Telegram verifies it is theirs — the server also checks contact.user_id = from.id), and the bot
-- answers with a one-tap link that opens the app signed in.
--   * a chat already linked → its own account;
--   * a Cambodian number with a phone account (855…@phone.luy.ibmserp.com) → that account, Telegram linked to it
--     (the same proof as the Telegram password reset, bot_reset_contact) — unless another Telegram is linked to it;
--   * a Cambodian number with no account → «new»: the server creates the phone account (Supabase admin API, service key)
--     and calls this again, which links it;
--   * any other number → «foreign» (the app's phone accounts are Cambodian).
-- The link's token is single-use, 15 minutes, stored only as its SHA-256; bot_signin_redeem spends it for the server's
-- /api/auth/telegram/link, which makes the session (a magic-link token redeemed on the server, never sent anywhere).

create table if not exists public.telegram_signin_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id    uuid not null references auth.users (id) on delete cascade,
  chat_id    bigint not null,
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists telegram_signin_tokens_user on public.telegram_signin_tokens (user_id);
alter table public.telegram_signin_tokens enable row level security;
revoke all on public.telegram_signin_tokens from anon, authenticated;

create or replace function public.bot_contact_account(p_key text, p_chat_id bigint, p_phone text, p_username text, p_language text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  addr text;
  uid uuid;
  other_chat bigint;
  token text;
begin
  perform public.require_bot(p_key);
  -- A chat already linked: its own account, whatever number it shares.
  select l.user_id into uid from public.telegram_links l join auth.users u on u.id = l.user_id
  where l.chat_id = p_chat_id and u.deleted_at is null;
  if uid is null then
    if digits !~ '^855[1-9][0-9]{7,8}$' then
      return jsonb_build_object('status', 'foreign');
    end if;
    addr := digits || '@phone.luy.ibmserp.com';
    select id into uid from auth.users where lower(email) = addr and deleted_at is null;
    if uid is null then
      return jsonb_build_object('status', 'new', 'email', addr);
    end if;
    select chat_id into other_chat from public.telegram_links where user_id = uid;
    if other_chat is not null and other_chat <> p_chat_id then
      return jsonb_build_object('status', 'elsewhere');
    end if;
    -- One chat belongs to one account (as bot_link_chat).
    delete from public.telegram_links where chat_id = p_chat_id and user_id <> uid;
    insert into public.telegram_links (user_id, chat_id, username, language)
    values (uid, p_chat_id, left(p_username, 64), case when p_language in ('en', 'zh') then p_language else 'km' end)
    on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username, linked_at = now();
    update public.telegram_settings set enabled = false where user_id = uid;
  end if;

  token := encode(extensions.gen_random_bytes(32), 'hex');
  delete from public.telegram_signin_tokens where user_id = uid or expires_at < now() - interval '1 day';
  insert into public.telegram_signin_tokens (token_hash, user_id, chat_id, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), uid, p_chat_id, now() + interval '15 minutes');
  return jsonb_build_object('status', 'ok', 'token', token);
end;
$$;

-- The server (/api/auth/telegram/link): spends the token once → the account's sign-in address.
create or replace function public.bot_signin_redeem(p_key text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  addr text;
begin
  perform public.require_bot(p_key);
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  update public.telegram_signin_tokens set used_at = now()
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and used_at is null and expires_at > now()
  returning user_id into uid;
  if uid is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select email into addr from auth.users where id = uid and deleted_at is null;
  if addr is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'email', addr);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_contact_account(text, bigint, text, text, text)',
    'public.bot_signin_redeem(text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

select public.apply_security_gate();
