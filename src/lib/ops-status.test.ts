import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { type OpsReport, overall, STALE_SECONDS, verdicts } from "./ops-status"

const NOW = 1_800_000_000
const healthy: OpsReport = {
  at: NOW - 60,
  website: { code: 200, ours: true, tampered: false, published_at: NOW - 3600, watched: true },
  app: { code: 200, build: "1", last_deploy: "abc on blue" },
  certs: { "luychlat.com": 73, "app.luychlat.com": 73 },
  domains: { "luychlat.com": { expires: "2027-10-10", days: 347 } },
  backup: { last_ok: NOW - 3600, last: "ok" },
  security: { ssh_password_login: false, firewall: true, banned_now: 0, banned_total: 73, auto_updates: true },
  disk: { free_gb: 60, used_pct: 25 },
}
const level = (r: OpsReport | null, key: string) => verdicts(r, NOW).find((v) => v.key === key)?.level
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("Control Center verdicts (founder, 28/10/2026)", () => {
  it("all green when everything is well", () => assert.equal(overall(verdicts(healthy, NOW)), "ok"))
  it("no report, or a stale one: the agent is down — red", () => {
    assert.equal(overall(verdicts(null, NOW)), "bad")
    assert.equal(level({ ...healthy, at: NOW - STALE_SECONDS - 1 }, "agent"), "bad")
  })
  it("the website: down, not ours, or tampered → red; not yet watched → amber", () => {
    assert.equal(level({ ...healthy, website: { ...healthy.website, code: 502 } }, "website"), "bad")
    assert.equal(level({ ...healthy, website: { ...healthy.website, tampered: true } }, "website"), "bad")
    assert.equal(level({ ...healthy, website: { ...healthy.website, ours: false } }, "website"), "bad")
    assert.equal(level({ ...healthy, website: { ...healthy.website, watched: false } }, "website"), "warn")
  })
  it("certificates and domains warn ahead of time", () => {
    assert.equal(level({ ...healthy, certs: { a: 13 } }, "certs"), "warn")
    assert.equal(level({ ...healthy, certs: { a: 6 } }, "certs"), "bad")
    assert.equal(level({ ...healthy, domains: { a: { expires: "x", days: 45 } } }, "domains"), "warn")
    assert.equal(level({ ...healthy, domains: { a: { expires: "x", days: 10 } } }, "domains"), "bad")
  })
  it("the backup: older than 26 h is red; never made yet is amber", () => {
    assert.equal(level({ ...healthy, backup: { last_ok: NOW - 27 * 3600, last: null } }, "backup"), "bad")
    assert.equal(level({ ...healthy, backup: { last_ok: null, last: null } }, "backup"), "warn")
  })
  it("security: SSH passwords on or the firewall off is red", () => {
    assert.equal(level({ ...healthy, security: { ...healthy.security, ssh_password_login: true } }, "security"), "bad")
    assert.equal(level({ ...healthy, security: { ...healthy.security, firewall: false } }, "security"), "bad")
    assert.equal(level({ ...healthy, security: { ...healthy.security, auto_updates: false } }, "security"), "warn")
  })
  it("the database: super admins read, only ops_request() writes, with 2FA on the session", () => {
    const sql = read("supabase/migrations/20270268000000_ops_control.sql")
    assert.match(sql, /revoke insert, update, delete on public\.ops_status from anon, authenticated/)
    assert.match(sql, /revoke insert, update, delete on public\.ops_commands from anon, authenticated/)
    assert.match(sql, /perform public\.require_super_admin\(\)/)
    assert.match(sql, /coalesce\(auth\.jwt\(\) ->> 'aal', ''\) <> 'aal2'/)
    assert.match(sql, /perform public\.audit\('OPS_REQUEST'/)
  })
  // deploy/ is not in the Docker build context (the build runs this suite): checked where it exists.
  it("the agent runs a fixed whitelist of server commands", { skip: !existsSync(join(process.cwd(), "deploy")) && "deploy/ is not in the build context" }, () => {
    const agent = read("deploy/ops-agent.py")
    assert.match(agent, /ACTIONS = \{\n    "website_republish": \["sh", f"\{REPO\}\/deploy\/landing-publish\.sh"\],\n    "website_rollback": \["sh", f"\{REPO\}\/deploy\/landing-publish\.sh", "rollback"\],\n    "backup_now": \["sh", f"\{REPO\}\/deploy\/db-backup\.sh"\],\n\}/)
  })
})
