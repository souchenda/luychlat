import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { migrationRisks } from "./migration-safety"

const DIR = join(process.cwd(), "supabase/migrations")

/** Written before the rule (28/10/2026) and long applied — each removed something no code used any more. */
const BEFORE_THE_RULE = new Set([
  "20261001070100_family_sharing.sql",
  "20261003000000_static_khqr.sql",
  "20261103000000_growth_controls.sql",
  "20270202000000_strict_gate_urgent_reminder.sql",
])

describe("Migrations only add — the running version keeps working while the update is applied (founder, 28/10/2026)", () => {
  it("additive changes pass: a table, a column with a default, a function replaced, a policy, an index", () => {
    const sql = `create table if not exists public.x (id uuid primary key);
alter table public.wallets add column if not exists note text default '';
drop function if exists public.f(uuid);
create or replace function public.f(p uuid, q text default null) returns void language sql as $$ select 1 $$;
drop policy if exists p on public.x; create policy p on public.x for select using (true);
drop index if exists x_idx; create index x_idx on public.x (id);
-- a note: we once had to drop column foo
/* drop table public.old */`
    assert.deepEqual(migrationRisks(sql), [])
  })
  it("taking something away is caught: a table, a column, a rename, a type change, not null, a function not created again", () => {
    const rules = (sql: string) => migrationRisks(sql).map((r) => r.rule)
    assert.deepEqual(rules("drop table public.old;"), ["drop table"])
    assert.deepEqual(rules("alter table public.w drop column if exists note;"), ["drop column"])
    assert.deepEqual(rules("alter table public.w rename column note to memo;"), ["rename column"])
    assert.deepEqual(rules("alter table public.w rename to wallet;"), ["rename table"])
    assert.deepEqual(rules("alter table public.w alter column amount type numeric(20,2);"), ["change column type"])
    assert.deepEqual(rules("alter table public.w alter column amount set data type bigint;"), ["change column type"])
    assert.deepEqual(rules("alter table public.w alter column note set not null;"), ["set not null"])
    assert.deepEqual(rules("drop function if exists public.gone(uuid);"), ["drop function"])
    assert.equal(migrationRisks("select 1;\n\ndrop table public.old;")[0].line, 3)
  })
  it("the deliberate second step passes when its file says why: «-- contract: …»", () => {
    assert.deepEqual(migrationRisks("-- contract: no code reads wallets.note since Task #540\nalter table public.wallets drop column note;"), [])
    assert.notDeepEqual(migrationRisks("-- contract:\nalter table public.wallets drop column note;"), []) // a reason is required
  })
  it("every migration in the repository follows it", { skip: !existsSync(DIR) && "no migrations folder" }, () => {
    const bad = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql") && !BEFORE_THE_RULE.has(f))
      .flatMap((f) => migrationRisks(readFileSync(join(DIR, f), "utf8")).map((r) => `${f}:${r.line} ${r.rule} — ${r.text}`))
    assert.deepEqual(bad, [], "A migration takes something away the running version may still use: make it additive, or ship the removal later with «-- contract: <why it is safe now>»")
  })
})
