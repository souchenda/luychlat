-- Loan document vault (PRO): up to 20 files per debt (PDF / images) with a
-- category, in the private 'loan-docs' bucket under <workspace_id>/<debt_id>/.
-- Every member of the debt's workspace can view, add and remove them; the
-- old two photos (debts.attachment_paths, receipts bucket) are listed here too.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-docs', 'loan-docs', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <workspace_id>/<debt_id>/<file>: the caller is a member of that workspace and
-- the debt belongs to it (a bad path is simply refused, never a cast error).
create or replace function public.loan_doc_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if cardinality(parts) <> 3 or parts[1] !~ uuid_re or parts[2] !~ uuid_re or coalesce(parts[3], '') = '' then
    return false;
  end if;
  return public.is_workspace_member(parts[1]::uuid)
    and exists (select 1 from public.debts d where d.id = parts[2]::uuid and d.workspace_id = parts[1]::uuid);
end;
$$;
revoke all on function public.loan_doc_path_ok(text) from public, anon;
grant execute on function public.loan_doc_path_ok(text) to authenticated;

-- Uploading is PRO (removing never is).
create or replace function public.loan_doc_upload_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.loan_doc_path_ok(p_name) and public.plan_code_of((select auth.uid())) <> 'FREE'
$$;
revoke all on function public.loan_doc_upload_ok(text) from public, anon;
grant execute on function public.loan_doc_upload_ok(text) to authenticated;

drop policy if exists loan_docs_select on storage.objects;
create policy loan_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'loan-docs' and public.loan_doc_path_ok(name) and public.access_ok());
drop policy if exists loan_docs_insert on storage.objects;
create policy loan_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'loan-docs' and public.loan_doc_upload_ok(name) and public.access_ok());
drop policy if exists loan_docs_delete on storage.objects;
create policy loan_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'loan-docs' and public.loan_doc_path_ok(name) and public.access_ok());

create table if not exists public.debt_documents (
  id           uuid primary key default gen_random_uuid(),
  debt_id      uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  bucket       text not null default 'loan-docs' check (bucket in ('loan-docs', 'receipts')),
  path         text not null,
  category     text not null default 'OTHER' check (category in ('CONTRACT', 'SCHEDULE', 'COLLATERAL', 'SLIP', 'OTHER')),
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text not null,
  size_bytes   integer check (size_bytes is null or size_bytes >= 0),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (debt_id, workspace_id) references public.debts (id, workspace_id) on delete cascade,
  unique (bucket, path)
);
create index if not exists debt_documents_debt_idx on public.debt_documents (debt_id, created_at);
create index if not exists debt_documents_ws_idx on public.debt_documents (workspace_id);

alter table public.debt_documents enable row level security;
revoke update on public.debt_documents from anon, authenticated;
grant update (category, file_name) on public.debt_documents to authenticated;

drop policy if exists debt_documents_select on public.debt_documents;
create policy debt_documents_select on public.debt_documents
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists debt_documents_insert on public.debt_documents;
create policy debt_documents_insert on public.debt_documents
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists debt_documents_update on public.debt_documents;
create policy debt_documents_update on public.debt_documents
  for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists debt_documents_delete on public.debt_documents;
create policy debt_documents_delete on public.debt_documents
  for delete to authenticated using (public.is_workspace_member(workspace_id));

-- 20 files per loan; new files are PRO, live in loan-docs under the debt's own
-- folder, and must already be uploaded.
create or replace function public.guard_debt_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  perform 1 from public.debts where id = new.debt_id for update;
  if (select count(*) from public.debt_documents where debt_id = new.debt_id) >= 20 then
    raise exception 'documents_limit' using errcode = '22023';
  end if;
  if uid is null then
    return new;
  end if;
  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  if new.bucket <> 'loan-docs' or split_part(new.path, '/', 1) <> new.workspace_id::text or split_part(new.path, '/', 2) <> new.debt_id::text then
    raise exception 'invalid document path' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'loan-docs' and o.name = new.path) then
    raise exception 'document not uploaded' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists debt_documents_guard on public.debt_documents;
create trigger debt_documents_guard
  before insert on public.debt_documents
  for each row execute function public.guard_debt_document();

-- The photos added before the vault (receipts bucket) appear in it as "Other".
insert into public.debt_documents (debt_id, workspace_id, bucket, path, category, file_name, mime_type, created_by, created_at)
select d.id, d.workspace_id, 'receipts', p.path, 'OTHER', 'photo-' || p.ord || '.jpg', 'image/jpeg', d.created_by, d.created_at
from public.debts d
cross join lateral unnest(d.attachment_paths) with ordinality as p(path, ord)
where cardinality(d.attachment_paths) > 0
on conflict (bucket, path) do nothing;

select public.apply_security_gate();
