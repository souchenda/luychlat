-- /admin › Roadmap couldn't save: its audit actions («roadmap.add», «roadmap.update») broke the audit
-- log's action rule (^[A-Z0-9_]{3,40}$) added later, so every add / status change was rolled back.
create or replace function public.dev_roadmap_save(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_status text := p_item ->> 'status';
begin
  perform public.require_super_admin();
  if v_id is null then
    insert into public.dev_roadmap (title, details, area, status, priority, created_by)
    values (btrim(p_item ->> 'title'), nullif(btrim(coalesce(p_item ->> 'details', '')), ''), coalesce(nullif(p_item ->> 'area', ''), 'other'),
            coalesce(v_status, 'todo'), coalesce((p_item ->> 'priority')::smallint, 2), (select auth.uid()))
    returning id into v_id;
    perform public.audit('ROADMAP_ADD', null, left(p_item ->> 'title', 200), v_id::text);
  else
    update public.dev_roadmap set
      title = coalesce(nullif(btrim(p_item ->> 'title'), ''), title),
      details = case when p_item ? 'details' then nullif(btrim(coalesce(p_item ->> 'details', '')), '') else details end,
      area = coalesce(nullif(p_item ->> 'area', ''), area),
      status = coalesce(v_status, status),
      priority = coalesce((p_item ->> 'priority')::smallint, priority),
      done_at = case when v_status = 'done' then now() when v_status in ('todo', 'doing') then null else done_at end,
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'not found' using errcode = '22023';
    end if;
    perform public.audit('ROADMAP_UPDATE', null, concat_ws(' → ', (select title from public.dev_roadmap where id = v_id), v_status), v_id::text);
  end if;
  return v_id;
end;
$$;
