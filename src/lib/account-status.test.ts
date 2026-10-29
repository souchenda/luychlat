import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// 29/10/2026: the demo account was suspended / 2FA-required, yet the app opened and every save said only «មានបញ្ហា» —
// the dormant-accounts migration had replaced my_account_status without the keys AccountGate reads.
describe("my_account_status answers every gate (AccountGate and DormantGate)", () => {
  it("the latest definition returns suspended, suspended_reason, require_2fa, status and telegram", () => {
    const dir = join(process.cwd(), "supabase/migrations")
    const defs = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((s) => /function public\.my_account_status\(\)/.test(s))
    const latest = defs.at(-1) ?? ""
    for (const key of ["suspended", "suspended_reason", "require_2fa", "status", "telegram"]) {
      assert.match(latest, new RegExp(`'${key}'`), `my_account_status lost '${key}'`)
    }
  })
  it("removing a staff member lifts the 2FA lock their role put on (the demo account, a former staff, stayed locked)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270277000000_staff_remove_2fa.sql"), "utf8")
    assert.match(sql, /admin_staff_remove/)
    assert.match(sql, /set require_2fa = false/)
  })
  it("2FA is the member's own choice (founder, 29/10/2026): no role and no admin puts it on; old requirements lifted", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270278000000_2fa_voluntary.sql"), "utf8")
    assert.match(sql, /admin_staff_set/)
    assert.match(sql, /if p_on then\s+return jsonb_build_object\('ok', false, 'reason', 'voluntary'\)/)
    assert.match(sql, /where c\.require_2fa loop/)
    const ui = readFileSync(join(process.cwd(), "src/components/admin/account-controls.tsx"), "utf8")
    assert.doesNotMatch(ui, /"admin\.require2faPrompt"/)
  })
  it("both gates read it", () => {
    for (const f of ["src/components/security/mfa-gate.tsx", "src/components/layout/dormant-gate.tsx"]) {
      assert.match(readFileSync(join(process.cwd(), f), "utf8"), /rpc\("my_account_status"\)/)
    }
  })
})
