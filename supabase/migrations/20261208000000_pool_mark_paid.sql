-- Shared pools, one tap: record what a member still owes against their target
-- (pledged − paid), for one member or for everyone at once ("collect all").
-- Returns the new transactions' ids so the app can offer Undo (deleting a
-- transaction also removes its pool_contributions row).

create or replace function public.pool_mark_paid(p_pool_id uuid, p_member_id uuid default null)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pools;
  snap jsonb;
  m jsonb;
  owed numeric;
  ids uuid[] := '{}';
  tx uuid;
begin
  select * into p from public.pools where id = p_pool_id;
  if p.id is null or not public.can_write_workspace(p.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p.status <> 'active' then
    raise exception 'pool is closed' using errcode = '22023';
  end if;
  snap := public.pool_snapshot(p.id, 'app');
  for m in select * from jsonb_array_elements(snap -> 'members') loop
    continue when p_member_id is not null and (m ->> 'id')::uuid <> p_member_id;
    owed := (m ->> 'pledged')::numeric - (m ->> 'paid')::numeric;
    continue when owed <= 0;
    perform public.pool_record_contribution(p.id, (m ->> 'id')::uuid, owed, null);
    -- now() is fixed for the transaction: this member's row from the call above.
    select pc.transaction_id into tx from public.pool_contributions pc
     where pc.member_id = (m ->> 'id')::uuid and pc.created_at = now()
     order by pc.id limit 1;
    ids := ids || tx;
  end loop;
  return ids;
end;
$$;

revoke all on function public.pool_mark_paid(uuid, uuid) from public, anon;
grant execute on function public.pool_mark_paid(uuid, uuid) to authenticated;
