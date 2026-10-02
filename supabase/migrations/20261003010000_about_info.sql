-- ===========================================================================
-- Settings › About LuyChlat: developer credits, mission and official links,
-- editable by admins (app_settings "about_info"; readable by signed-in users
-- through the existing app_settings select policy). Idempotent.
-- ===========================================================================
create or replace function public.admin_set_about_info(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_value, '{}'::jsonb);
  link text;
begin
  perform public.require_admin();
  if jsonb_typeof(v) <> 'object' or length(v::text) > 4000 then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  if char_length(coalesce(v ->> 'developer', '')) > 80
     or char_length(coalesce(v ->> 'credits', '')) > 1000
     or char_length(coalesce(v ->> 'mission_km', '')) > 500
     or char_length(coalesce(v ->> 'mission_en', '')) > 500 then
    raise exception 'text too long' using errcode = '22023';
  end if;
  foreach link in array array[v ->> 'website', v ->> 'facebook'] loop
    if nullif(btrim(link), '') is not null and (link !~ '^https://[^\s"<>]+$' or char_length(link) > 200) then
      raise exception 'links must start with https://' using errcode = '22023';
    end if;
  end loop;
  if nullif(btrim(v ->> 'email'), '') is not null and (v ->> 'email') !~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('about_info', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_about_info(jsonb) from public, anon;
grant execute on function public.admin_set_about_info(jsonb) to authenticated;
