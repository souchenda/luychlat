import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

/**
 * Regression (19/10/2026): admin_audit_log.action must match ^[A-Z0-9_]{3,40}$. Functions that logged
 * 'place_approve', 'dua_recording_set', 'adhan_preset_add' in lower case failed as a whole — [ ✅ អនុម័ត ] on a place
 * in «LCA Approval» answered «មិនអាចរក្សាទុកបានទេ». Every audit action must pass the check, or be rewritten by
 * 20270187000000_audit_action_uppercase.sql.
 */
const DIR = join(process.cwd(), "supabase/migrations")
const FIX = "20270187000000_audit_action_uppercase.sql"
const ACTION = /^[A-Z0-9_]{3,40}$/

describe("Audit actions satisfy admin_audit_log's check (19/10/2026 regression)", () => {
  const files = readdirSync(DIR).sort()
  const fix = readFileSync(join(DIR, FIX), "utf8")

  it("the check is the one the functions must meet", () => {
    const sql = files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n")
    assert.match(sql, /check \(action ~ '\^\[A-Z0-9_\]\{3,40\}\$'\)/)
  })

  it("every action before the fix is valid or rewritten by it; every action after it is valid", () => {
    for (const f of files) {
      for (const m of readFileSync(join(DIR, f), "utf8").matchAll(/public\.audit\('([^']+)'/g)) {
        const action = m[1]
        if (ACTION.test(action)) continue
        assert.ok(f < FIX, `${f}: audit action «${action}» fails the audit log's check — use upper case`)
        const to = action.toUpperCase().replace(/\./g, "_")
        assert.ok(fix.includes(`replace(def, '''${action}''', '''${to}''')`), `${f}: «${action}» is not rewritten by ${FIX}`)
        assert.ok(ACTION.test(to))
      }
    }
  })

  it("a failed place review is logged, never silent", () => {
    assert.match(readFileSync(join(process.cwd(), "src/lib/server/place-alerts.ts"), "utf8"), /deps\.log\("error", `Place review failed/)
  })
})
