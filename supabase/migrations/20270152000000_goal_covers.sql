-- A savings goal's cover photo (camera-first intake, founder 12/10/2026). Private bucket goal-covers,
-- path <uploader id>/<file>: the uploader sees their file, and so does every member of the workspace
-- whose goal shows it.

alter table public.wallets_accounts add column if not exists cover_path text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_accounts_cover_path_check') then
    alter table public.wallets_accounts add constraint wallets_accounts_cover_path_check
      check (cover_path is null or (char_length(cover_path) <= 200 and cover_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-covers', 'goal-covers', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists goal_covers_insert on storage.objects;
create policy goal_covers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'goal-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists goal_covers_select on storage.objects;
create policy goal_covers_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'goal-covers'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.wallets_accounts w where w.cover_path = storage.objects.name and public.is_workspace_member(w.workspace_id))
    )
  );

drop policy if exists goal_covers_delete on storage.objects;
create policy goal_covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'goal-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

select public.apply_security_gate();
