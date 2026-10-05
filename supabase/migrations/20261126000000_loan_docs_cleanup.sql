-- Loan files are removed from Storage when their document rows go — one by one
-- or all at once when the loan itself is deleted (debt_documents cascade).
-- SQL can't delete the stored file itself (only the Storage API can), so the
-- rows' paths are queued here and the app of a workspace member removes them
-- (right after the delete, and again on later visits if that failed).

create table if not exists public.storage_cleanup (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null,
  bucket       text not null check (bucket in ('loan-docs', 'receipts')),
  path         text not null,
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists storage_cleanup_ws_idx on public.storage_cleanup (workspace_id);

alter table public.storage_cleanup enable row level security;
revoke insert, update on public.storage_cleanup from anon, authenticated;
drop policy if exists storage_cleanup_select on public.storage_cleanup;
create policy storage_cleanup_select on public.storage_cleanup
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists storage_cleanup_delete on public.storage_cleanup;
create policy storage_cleanup_delete on public.storage_cleanup
  for delete to authenticated using (public.is_workspace_member(workspace_id));

create or replace function public.queue_debt_document_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_cleanup (workspace_id, bucket, path)
  values (old.workspace_id, old.bucket, old.path)
  on conflict (bucket, path) do nothing;
  return null;
end;
$$;

drop trigger if exists debt_documents_cleanup on public.debt_documents;
create trigger debt_documents_cleanup
  after delete on public.debt_documents
  for each row execute function public.queue_debt_document_cleanup();

-- Reading and removing a loan file only needs membership of its workspace (the
-- first folder), so files of a deleted loan can still be cleaned up. Uploads
-- still require the loan to exist (loan_doc_upload_ok).
create or replace function public.loan_doc_workspace_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if cardinality(parts) <> 3 or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_workspace_member(parts[1]::uuid);
end;
$$;
revoke all on function public.loan_doc_workspace_ok(text) from public, anon;
grant execute on function public.loan_doc_workspace_ok(text) to authenticated;

drop policy if exists loan_docs_select on storage.objects;
create policy loan_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'loan-docs' and public.loan_doc_workspace_ok(name) and public.access_ok());
drop policy if exists loan_docs_delete on storage.objects;
create policy loan_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'loan-docs' and public.loan_doc_workspace_ok(name) and public.access_ok());

select public.apply_security_gate();
