import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { canManageIslamicMode } from "./islamic-access"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sql = () => read("supabase/migrations/20270174000000_islamic_mode_admin_lock.sql")

describe("Islamic Mode — admin / owner only (founder, 18/10/2026)", () => {
  it("only an admin or the super admin may change it; a regular user or support staff may not", () => {
    assert.equal(canManageIslamicMode({ is_admin: true }), true)
    assert.equal(canManageIslamicMode({ is_admin: false, staff_role: "super_admin" }), true)
    assert.equal(canManageIslamicMode({ is_admin: false, staff_role: "admin" }), true)
    assert.equal(canManageIslamicMode({ is_admin: false, staff_role: "support" }), false)
    assert.equal(canManageIslamicMode({ is_admin: false, staff_role: null }), false)
    assert.equal(canManageIslamicMode(null), false)
  })
  it("the database refuses a regular user's change, whatever the request (RPC or a direct upsert)", () => {
    const s = sql()
    assert.match(s, /if \(select auth\.uid\(\)\) is not null and not public\.is_admin\(\) then/)
    assert.match(s, /if tg_op = 'INSERT' and new\.enabled then\s+raise exception 'islamic mode is managed by an admin'/)
    assert.match(s, /if tg_op = 'UPDATE' and new\.enabled is distinct from old\.enabled then\s+raise exception 'islamic mode is managed by an admin'/)
    assert.match(s, /create trigger islamic_mode_guard before insert or update on public\.islamic_settings/)
  })
  it("the admin's switch for a user is checked, noted and audited; the status is readable by admins only", () => {
    const s = sql()
    assert.match(s, /admin_set_islamic_mode[\s\S]*perform public\.admin_check_target\(p_user_id, p_note\);/)
    assert.match(s, /perform public\.audit\(case when coalesce\(p_on, false\) then 'ISLAMIC_MODE_ON' else 'ISLAMIC_MODE_OFF' end, p_user_id, p_note, null\);/)
    assert.match(s, /admin_islamic_mode[\s\S]*perform public\.require_admin\(\);/)
  })
  it("the app: the Settings switch is locked 🔒 for a regular user, no Enable button or first-login choice for them", () => {
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /disabled=\{!canManage \|\| loading \|\| setEnabled\.isPending\}/)
    assert.match(settings, /: t\("islamic\.managedByAdmin"\)\}/)
    const mode = read("src/components/islamic/islamic-mode.tsx")
    assert.match(mode, /\{canManage \? \(\s+<Button/)
    assert.match(mode, /const open = canManage && loaded/)
    assert.match(read("src/lib/i18n/dictionaries.ts"), /"islamic\.managedByAdmin": "មុខងារនេះត្រូវបានគ្រប់គ្រងដោយ Admin"/)
  })
})
