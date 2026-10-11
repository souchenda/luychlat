-- Several KHQR codes per workspace (ABA $, ABA ៛, ACLEDA ៛, Wing…): kept on /invoices, switched on the
-- /soundbox cashier screen, one of them the default. The code itself is its payload (redrawn exactly,
-- never changed); the uploaded screenshot is kept for reference. The bank and currency are read from
-- the code in the app (src/lib/khqr.ts › khqrBank / khqrInfo) and can be corrected.
-- The user's single profile KHQR (profiles.khqr_payload) becomes the first, default code of each
-- workspace they own; invoice receipts now use the workspace's code in the invoice's currency.

create table if not exists public.workspace_khqr_codes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  wallet_id     uuid references public.wallets_accounts (id) on delete set null,
  bank_code     text not null default 'OTHER' check (bank_code in ('ABA', 'ACLEDA', 'WING', 'CANADIA', 'SATHAPANA', 'OTHER')),
  currency      public.currency_code not null,
  merchant_name text check (merchant_name is null or char_length(merchant_name) <= 80),
  khqr_payload  text not null check (char_length(khqr_payload) between 20 and 512 and khqr_payload ~ '^000201'),
  -- Storage path of the uploaded screenshot (bucket khqr-codes, "<workspace_id>/…"), shown by signed URL.
  image_path    text check (image_path is null or char_length(image_path) <= 200),
  is_default    boolean not null default false,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, khqr_payload)
);
create index if not exists workspace_khqr_codes_ws_idx on public.workspace_khqr_codes (workspace_id);
-- One default per workspace.
create unique index if not exists workspace_khqr_codes_default_idx on public.workspace_khqr_codes (workspace_id) where is_default;

alter table public.workspace_khqr_codes enable row level security;
revoke all on public.workspace_khqr_codes from anon, authenticated;
grant select, insert, update (wallet_id, bank_code, currency, merchant_name), delete on public.workspace_khqr_codes to authenticated;
drop policy if exists workspace_khqr_codes_select on public.workspace_khqr_codes;
create policy workspace_khqr_codes_select on public.workspace_khqr_codes for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists workspace_khqr_codes_insert on public.workspace_khqr_codes;
create policy workspace_khqr_codes_insert on public.workspace_khqr_codes for insert to authenticated with check (public.can_write_workspace(workspace_id));
drop policy if exists workspace_khqr_codes_update on public.workspace_khqr_codes;
create policy workspace_khqr_codes_update on public.workspace_khqr_codes for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
drop policy if exists workspace_khqr_codes_delete on public.workspace_khqr_codes;
create policy workspace_khqr_codes_delete on public.workspace_khqr_codes for delete to authenticated using (public.can_write_workspace(workspace_id));

-- The screenshot in the workspace's folder, the wallet in the same workspace, at most 10 codes;
-- the first code is the default.
create or replace function public.guard_workspace_khqr()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_path is not null and new.image_path not like new.workspace_id::text || '/%' then
    raise exception 'invalid image path' using errcode = '22023';
  end if;
  if new.wallet_id is not null and not exists (select 1 from public.wallets_accounts w where w.id = new.wallet_id and w.workspace_id = new.workspace_id) then
    raise exception 'invalid wallet' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.workspace_khqr_codes c where c.workspace_id = new.workspace_id) >= 10 then
      raise exception 'too many codes' using errcode = '22023';
    end if;
    new.is_default := not exists (select 1 from public.workspace_khqr_codes c where c.workspace_id = new.workspace_id and c.is_default);
  end if;
  return new;
end;
$$;
drop trigger if exists workspace_khqr_codes_guard on public.workspace_khqr_codes;
create trigger workspace_khqr_codes_guard before insert or update on public.workspace_khqr_codes
  for each row execute function public.guard_workspace_khqr();

-- The default deleted: the oldest remaining code takes over.
create or replace function public.khqr_default_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    update public.workspace_khqr_codes set is_default = true
    where id = (select c.id from public.workspace_khqr_codes c where c.workspace_id = old.workspace_id order by c.created_at limit 1);
  end if;
  return null;
end;
$$;
drop trigger if exists workspace_khqr_codes_default_after_delete on public.workspace_khqr_codes;
create trigger workspace_khqr_codes_default_after_delete after delete on public.workspace_khqr_codes
  for each row execute function public.khqr_default_after_delete();

-- «⭐ សំខាន់»: this code becomes the workspace's default (writers only).
create or replace function public.khqr_set_default(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.workspace_khqr_codes where id = p_id;
  if ws is null or not public.can_write_workspace(ws) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.workspace_khqr_codes set is_default = false where workspace_id = ws and is_default and id <> p_id;
  update public.workspace_khqr_codes set is_default = true where id = p_id;
end;
$$;
revoke all on function public.khqr_set_default(uuid) from public, anon;
grant execute on function public.khqr_set_default(uuid) to authenticated;

-- Screenshots: members of the workspace read them, writers add and remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('khqr-codes', 'khqr-codes', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.khqr_image_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  begin
    ws := (storage.foldername(p_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.access_ok() and case when p_write then public.can_write_workspace(ws) else public.is_workspace_member(ws) end;
end;
$$;
revoke all on function public.khqr_image_access(text, boolean) from public, anon;
grant execute on function public.khqr_image_access(text, boolean) to authenticated;

drop policy if exists khqr_codes_select on storage.objects;
create policy khqr_codes_select on storage.objects for select to authenticated using (bucket_id = 'khqr-codes' and public.khqr_image_access(name, false));
drop policy if exists khqr_codes_insert on storage.objects;
create policy khqr_codes_insert on storage.objects for insert to authenticated with check (bucket_id = 'khqr-codes' and public.khqr_image_access(name, true));
drop policy if exists khqr_codes_delete on storage.objects;
create policy khqr_codes_delete on storage.objects for delete to authenticated using (bucket_id = 'khqr-codes' and public.khqr_image_access(name, true));

-- One top-level EMV field of a KHQR payload ("ID LEN VALUE"), or null.
create or replace function public.emv_tag(p_payload text, p_tag text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  i integer := 1;
  len integer;
begin
  while i + 3 <= char_length(p_payload) loop
    if substring(p_payload from i + 2 for 2) !~ '^\d{2}$' then
      return null;
    end if;
    len := substring(p_payload from i + 2 for 2)::integer;
    if substring(p_payload from i for 2) = p_tag then
      return substring(p_payload from i + 4 for len);
    end if;
    i := i + 4 + len;
  end loop;
  return null;
end;
$$;

-- The existing profile KHQR → the first (default) code of each workspace its owner owns. Currency
-- from tag 53 (840 USD, else KHR); the bank from the Bakong ID / acquirer name, else OTHER.
insert into public.workspace_khqr_codes (workspace_id, bank_code, currency, merchant_name, khqr_payload, created_by)
select w.id,
  case
    when p.khqr_payload ~* '@abaa|ABA Bank|Advanced Bank' then 'ABA'
    when p.khqr_payload ~* '@aclb|ACLEDA' then 'ACLEDA'
    when p.khqr_payload ~* '@wing|Wing Bank' then 'WING'
    when p.khqr_payload ~* '@cadi|Canadia' then 'CANADIA'
    when p.khqr_payload ~* '@sbpl|Sathapana' then 'SATHAPANA'
    else 'OTHER'
  end,
  case when public.emv_tag(p.khqr_payload, '53') = '840' then 'USD' else 'KHR' end::public.currency_code,
  nullif(btrim(public.emv_tag(p.khqr_payload, '59')), ''),
  p.khqr_payload, p.id
from public.profiles p
join public.workspaces w on w.user_id = p.id
where p.khqr_payload is not null
on conflict (workspace_id, khqr_payload) do nothing;

-- Invoice receipts: the workspace's code in the invoice's currency, else its default, else the
-- creator's profile KHQR.
create or replace function public.invoice_receipt(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  ws public.workspaces;
  p public.profiles;
  code text;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if inv.id is null or not public.is_workspace_member(inv.workspace_id) then
    return null;
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;
  select * into p from public.profiles where id = inv.created_by;
  select c.khqr_payload into code from public.workspace_khqr_codes c
  where c.workspace_id = inv.workspace_id
  order by (c.currency = inv.currency) desc, c.is_default desc, c.created_at
  limit 1;
  return jsonb_build_object(
    'invoice', to_jsonb(inv),
    'merchant', case when ws.type = 'BUSINESS' then ws.name else coalesce(nullif(btrim(p.display_name), ''), ws.name) end,
    'merchant_phone', case when ws.type = 'BUSINESS' then ws.business_phone end,
    'khqr', coalesce(code, p.khqr_payload)
  );
end;
$$;
revoke all on function public.invoice_receipt(uuid) from public, anon;
grant execute on function public.invoice_receipt(uuid) to authenticated;

select public.apply_security_gate();
