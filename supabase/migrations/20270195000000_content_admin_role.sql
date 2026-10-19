-- Role-based access (founder, 19/10/2026): only the founder (super_admin) ever sees revenue, payments, subscriptions or
-- core settings. A new role, «content_admin» (Yerny), manages community content only — Islamic places, qasidah, du'a
-- recordings, Adhans — and approves in «LCA Approval» (co-approver). It is not «admin» and not «staff»: every admin_*
-- function refuses it. The financial functions are the founder's alone, also for the «admin» role.

-- 1. The role.
alter table public.app_admins drop constraint if exists app_admins_role_check;
alter table public.app_admins add constraint app_admins_role_check check (role in ('support', 'admin', 'super_admin', 'content_admin'));

-- 2. «Staff» (support tickets, system status…) no longer means any row: a content admin is not staff.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()) and a.role in ('support', 'admin', 'super_admin'));
$$;

-- 3. Who manages community content: the content admin, the admin, the founder.
create or replace function public.is_content_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()) and a.role in ('content_admin', 'admin', 'super_admin'));
$$;
revoke all on function public.is_content_manager() from public, anon;
grant execute on function public.is_content_manager() to authenticated;

-- 4. The content rules: is_admin() → is_content_manager() (places and their photos, qasidah tracks and audio).
do $$
declare
  p record;
  using_expr text;
  check_expr text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where (schemaname = 'public' and tablename in ('islamic_places', 'nasheed_tracks') and policyname <> 'security_gate')
       or (schemaname = 'storage' and tablename = 'objects' and policyname in ('nasheed_audio_write', 'nasheed_audio_update', 'nasheed_audio_delete', 'place_photos_select', 'place_photos_insert', 'place_photos_delete'))
  loop
    using_expr := replace(p.qual, 'is_admin()', 'public.is_content_manager()');
    check_expr := replace(p.with_check, 'is_admin()', 'public.is_content_manager()');
    if using_expr is not distinct from p.qual and check_expr is not distinct from p.with_check then continue; end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if using_expr is not null then stmt := stmt || format(' using (%s)', using_expr); end if;
    if check_expr is not null then stmt := stmt || format(' with check (%s)', check_expr); end if;
    execute stmt;
  end loop;
end $$;

-- 5. The content functions (du'a recordings, Adhans for everyone).
do $$
declare
  r record;
  def text;
begin
  for r in
    select * from (values
      ('public.dua_recording_put(uuid,text,text,text,text)', $x$a.role in ('super_admin', 'admin')$x$, $x$a.role in ('super_admin', 'admin', 'content_admin')$x$),
      ('public.dua_recording_set(text,text,text,text)', 'public.is_admin()', 'public.is_content_manager()'),
      ('public.dua_recording_remove(text)', 'not public.is_admin()', 'not public.is_content_manager()'),
      ('public.adhan_preset_add(text,text,text,text,text)', 'not public.is_admin()', 'not public.is_content_manager()'),
      ('public.adhan_preset_remove(uuid)', 'not public.is_admin()', 'not public.is_content_manager()')
    ) as v(fn, old_text, new_text)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in def) = 0 then raise exception 'content_admin: % has no %', r.fn, r.old_text; end if;
    execute replace(def, r.old_text, r.new_text);
  end loop;
end $$;

-- 6. Revenue, payments, subscriptions and the user directory (plans, payments): the founder only.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'admin_cancel_subscription', 'admin_extend_subscription', 'admin_list_payments', 'admin_list_subscribers',
    'admin_list_users', 'admin_review_payment', 'admin_set_subscription_end'
  ] loop
    for def in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f loop
      if position('perform public.require_admin()' in def) = 0 then raise exception 'finance: % has no require_admin', f; end if;
      execute replace(def, 'perform public.require_admin()', 'perform public.require_super_admin()');
    end loop;
  end loop;
end $$;

-- 7. Admin › Staff: the new role, and no account-wide 2FA lock for a content admin (no console to protect).
do $$
declare
  def text := pg_get_functiondef('public.admin_staff_set(text,text,text)'::regprocedure);
begin
  def := replace(def, $x$if p_role not in ('support', 'admin', 'super_admin') then$x$, $x$if p_role not in ('support', 'admin', 'super_admin', 'content_admin') then$x$);
  def := regexp_replace(def,
    '(insert into public\.account_controls \(user_id, require_2fa\) values \(v_user, true\)\s+on conflict \(user_id\) do update set require_2fa = true, updated_at = now\(\);)',
    $x$if p_role <> 'content_admin' then \1 end if;$x$);
  if position('content_admin' in def) = 0 then raise exception 'staff: admin_staff_set not updated'; end if;
  execute def;
end $$;

-- 8. Yerny: content admin (the founder's decision).
do $$
declare
  member constant uuid := 'b6866ff8-3da6-41fa-8119-18a103ca7cf5';
  founder constant uuid := '2e110364-2289-4544-a8f5-023549e5adc4';
begin
  update public.app_admins set role = 'content_admin' where user_id = member and role <> 'content_admin';
  if found then
    perform public.audit('STAFF_ROLE_CHANGED', member, 'Yerny — content admin only: no revenue, payments or settings (founder''s decision)', null, founder,
      jsonb_build_object('from', 'admin', 'to', 'content_admin'));
  end if;
end $$;

-- 9. A member's contact email from the admin user card (founder only, audited) — never their sign-in.
create or replace function public.admin_contact_email(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_super_admin();
  return (select pp.contact_email from public.profile_private pp where pp.user_id = p_user_id);
end $$;
revoke all on function public.admin_contact_email(uuid) from public, anon;
grant execute on function public.admin_contact_email(uuid) to authenticated;

create or replace function public.admin_set_contact_email(p_user_id uuid, p_email text, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform public.require_super_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note required' using errcode = '22023'; end if;
  insert into public.profile_private (user_id, contact_email, updated_at) values (p_user_id, v, now())
  on conflict (user_id) do update set contact_email = excluded.contact_email, updated_at = now();
  perform public.audit('CONTACT_EMAIL_SET', p_user_id, p_note, coalesce(v, '—'));
end $$;
revoke all on function public.admin_set_contact_email(uuid, text, text) from public, anon;
grant execute on function public.admin_set_contact_email(uuid, text, text) to authenticated;
