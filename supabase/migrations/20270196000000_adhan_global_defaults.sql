-- The app-wide default Adhans (founder, 19/10/2026): one for the regular prayers, one for Fajr, set with one tap in the
-- Adhan manager (/admin). Every member who has not chosen an Adhan of their own hears the regular default; at Fajr,
-- with «អាហ្សានស៊ុពហ៍» on, the Fajr default. Stored in app_settings «adhan_defaults» {regular, fajr} (readable by every
-- member); set only by a content manager, audited ADHAN_PUBLISH. A preset is a bundled recording with a file, or an
-- Adhan published for everyone («g:<id>», still active).
create or replace function public.admin_adhan_set(p_kind text, p_preset text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cur jsonb;
  pid text := nullif(btrim(coalesce(p_preset, '')), '');
begin
  if not public.is_content_manager() then raise exception 'content manager only' using errcode = '42501'; end if;
  if p_kind not in ('regular', 'fajr') then raise exception 'bad kind' using errcode = '22023'; end if;
  if pid is not null
     and pid not in ('commons-cc0-natural', 'commons-cc0-short', 'commons-cc0')
     and not (pid ~ '^g:[0-9a-f-]{36}$' and exists (select 1 from public.adhan_presets a where a.id = substr(pid, 3)::uuid and a.active)) then
    raise exception 'unknown preset' using errcode = '22023';
  end if;
  select s.value into cur from public.app_settings s where s.key = 'adhan_defaults';
  cur := coalesce(cur, '{}'::jsonb) || jsonb_build_object(p_kind, pid);
  insert into public.app_settings (key, value, updated_at) values ('adhan_defaults', cur, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.audit('ADHAN_PUBLISH', null, p_kind || ' → ' || coalesce(pid, '—'), pid);
  return cur;
end $$;
revoke all on function public.admin_adhan_set(text, text) from public, anon;
grant execute on function public.admin_adhan_set(text, text) to authenticated;
