-- «Record only» for every business, with or without its own API key (founder, 8/11/2026): AUTOBOK's one key
-- brings the payments of all the owner's shops (20270302000000), so a shop has no key of its own. The info
-- always answers `quiet`; the key fields only when a key exists.
create or replace function public.khqr_api_key_info(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws public.workspaces;
begin
  select * into ws from public.workspaces w where w.id = p_workspace_id and w.user_id = (select auth.uid());
  if ws.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('quiet', ws.khqr_quiet)
    || coalesce((select jsonb_build_object('hint', k.key_hint, 'created_at', k.created_at, 'last_used_at', k.last_used_at)
                   from public.khqr_api_keys k where k.workspace_id = p_workspace_id), '{}'::jsonb);
end;
$$;
