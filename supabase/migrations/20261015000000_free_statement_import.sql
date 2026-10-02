-- One free bank statement import per account (onboarding hook); after that,
-- statement import stays a PRO feature.
--
-- The credit is kept apart from statement_imports so undoing an import (which
-- deletes it) or resetting data doesn't hand out another free one. Users can
-- read their own row; only import_statement (security definer) writes it, in
-- the same transaction as the import, so a failed import uses no credit.

create table if not exists public.statement_import_credits (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  used_at  timestamptz not null default now()
);

alter table public.statement_import_credits enable row level security;

drop policy if exists statement_import_credits_select on public.statement_import_credits;
create policy statement_import_credits_select on public.statement_import_credits
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.statement_import_credits from anon;
revoke insert, update, delete on public.statement_import_credits from authenticated;
grant select on public.statement_import_credits to authenticated;

-- import_statement: FREE users may import once.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.import_statement(uuid, jsonb, jsonb, boolean)'::regprocedure);
  if position('statement_import_credits' in def) = 0 then
    def := replace(
      def,
      $old$  if public.plan_code_of(uid) = 'FREE' then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;$old$,
      $new$  if public.plan_code_of(uid) = 'FREE' then
    -- The one free import: claimed atomically, refused once used.
    insert into public.statement_import_credits (user_id) values (uid) on conflict (user_id) do nothing;
    if not found then
      raise exception 'plan_required' using errcode = 'P0001';
    end if;
  end if;$new$
    );
    if position('statement_import_credits' in def) = 0 then
      raise exception 'import_statement: plan check not found, free import not applied';
    end if;
    execute def;
  end if;
end $$;

select public.apply_security_gate();
