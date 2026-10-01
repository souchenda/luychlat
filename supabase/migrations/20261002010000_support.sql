-- ===========================================================================
-- Help & Support: contact channels (set by the admin) and in-app tickets.
-- Users only create tickets through submit_support_ticket() (rate limited)
-- and read their own; admins read and answer them through admin_* functions.
-- New tickets are sent to admins' Telegram (their own Settings › Telegram
-- bot); a reply is sent to the user's Telegram the same way.
-- Idempotent: safe to re-run.
-- ===========================================================================

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category    text not null check (category in ('PAYMENT', 'BUG', 'FEATURE', 'OTHER')),
  message     text not null check (char_length(btrim(message)) between 5 and 2000),
  contact     text check (contact is null or char_length(contact) <= 80),
  -- App screen, language, plan, app version: helps reproduce a problem.
  context     jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 2000),
  status      text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 2000),
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;
drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()));

-- Contact channels; readable without signing in (Guest Mode needs help too).
create or replace function public.support_contacts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.app_settings where key = 'support_contacts'), '{}'::jsonb);
$$;

create or replace function public.admin_set_support_contacts(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  telegram text := nullif(btrim(p_value ->> 'telegram_url'), '');
  community text := nullif(btrim(p_value ->> 'community_url'), '');
  phone text := nullif(btrim(p_value ->> 'phone'), '');
  hours text := left(nullif(btrim(p_value ->> 'hours'), ''), 80);
begin
  perform public.require_admin();
  if telegram is not null and telegram !~ '^https://t\.me/[A-Za-z0-9_]{5,32}/?$' then
    raise exception 'invalid telegram link' using errcode = '22023';
  end if;
  if community is not null and community !~ '^https://t\.me/(\+[A-Za-z0-9_-]{8,40}|[A-Za-z0-9_]{5,32})/?$' then
    raise exception 'invalid community link' using errcode = '22023';
  end if;
  if phone is not null and phone !~ '^\+?[0-9][0-9 ]{5,18}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values ('support_contacts', jsonb_strip_nulls(jsonb_build_object(
    'telegram_url', telegram, 'community_url', community, 'phone', phone, 'hours', hours)), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.html_escape(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- At most 5 tickets a day and 10 open at a time per user.
create or replace function public.submit_support_ticket(p_category text, p_message text, p_contact text, p_context jsonb)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ticket public.support_tickets;
  who text;
  a record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.support_tickets where user_id = uid and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.support_tickets where user_id = uid and status in ('OPEN', 'IN_PROGRESS')) >= 10 then
    raise exception 'too_many_tickets' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (user_id, category, message, contact, context)
  values (
    uid, upper(p_category), btrim(p_message), left(nullif(btrim(p_contact), ''), 80),
    case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end
  )
  returning * into ticket;

  select coalesce(nullif(p.display_name, ''), u.email::text, 'User') into who
  from auth.users u left join public.profiles p on p.id = u.id where u.id = uid;

  for a in
    select t.bot_token, t.chat_id from public.app_admins ad
    join public.telegram_settings t on t.user_id = ad.user_id and t.enabled
  loop
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || a.bot_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', a.chat_id,
        'parse_mode', 'HTML',
        'text', '🆘 <b>Support · ' || ticket.category || '</b>' || E'\n'
          || public.html_escape(who) || coalesce(' · ' || public.html_escape(ticket.contact), '') || E'\n\n'
          || public.html_escape(left(ticket.message, 1000)) || E'\n\n— LuySmart /admin'
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;
  return ticket;
end;
$$;

create or replace function public.admin_list_tickets(p_status text, p_limit integer)
returns table (
  id uuid, user_id uuid, email text, display_name text, plan_code text, category text, message text, contact text,
  context jsonb, status text, admin_reply text, replied_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select t.id, t.user_id, u.email::text, p.display_name, public.plan_code_of(t.user_id), t.category, t.message, t.contact,
         t.context, t.status, t.admin_reply, t.replied_at, t.created_at
  from public.support_tickets t
  join auth.users u on u.id = t.user_id
  left join public.profiles p on p.id = t.user_id
  where case coalesce(p_status, 'active')
    when 'active' then t.status in ('OPEN', 'IN_PROGRESS')
    when 'all' then true
    else t.status = p_status
  end
  order by (t.status = 'OPEN') desc, t.created_at desc
  limit least(coalesce(p_limit, 50), 200);
end;
$$;

create or replace function public.admin_update_ticket(p_ticket_id uuid, p_status text, p_reply text)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket public.support_tickets;
  reply text := left(nullif(btrim(p_reply), ''), 2000);
  tg record;
begin
  perform public.require_admin();
  if p_status not in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.support_tickets
  set status = p_status,
      admin_reply = coalesce(reply, admin_reply),
      replied_at = case when reply is not null then now() else replied_at end,
      updated_at = now()
  where id = p_ticket_id
  returning * into ticket;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  if reply is not null then
    select t.bot_token, t.chat_id, t.language into tg from public.telegram_settings t where t.user_id = ticket.user_id and t.enabled;
    if found then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || tg.bot_token || '/sendMessage',
        body := jsonb_build_object(
          'chat_id', tg.chat_id,
          'parse_mode', 'HTML',
          'text', case when tg.language = 'en' then '💬 <b>LuySmart Support replied</b>' else '💬 <b>ក្រុមជំនួយ លុយឆ្លាត បានឆ្លើយតប</b>' end
            || E'\n\n' || public.html_escape(reply)
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  end if;
  return ticket;
end;
$$;

-- Users may close their own ticket.
create or replace function public.close_my_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set status = 'CLOSED', updated_at = now()
  where id = p_ticket_id and user_id = (select auth.uid()) and status <> 'CLOSED';
end;
$$;

revoke all on function public.html_escape(text) from public, anon, authenticated;
revoke all on function public.support_contacts() from public;
grant execute on function public.support_contacts() to anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_set_support_contacts(jsonb)',
    'public.submit_support_ticket(text, text, text, jsonb)',
    'public.admin_list_tickets(text, integer)',
    'public.admin_update_ticket(uuid, text, text)',
    'public.close_my_ticket(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
