import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { BUILD_SETTLE_S, type Capacity, REMIND_EVERY_MS, capacityItems, dueReminders, reminderText } from "./capacity"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
// The server on 28/10/2026, measured by the agent's capacity() on the Droplet.
const TODAY: Capacity = { cpus: 2, load15: 0.55, ram_pct: 52, ram_total_mb: 3916, dockerd_mb: 1149, building: false, db_bytes: 31889075, db_conns: 29, db_max_conns: 60, accounts: 6, active_30d: 6, storage_bytes: 14015000 }
const MB = 1024 * 1024
const at = (items: ReturnType<typeof capacityItems>, key: string) => items.find((i) => i.key === key)!

describe("Capacity and spending — remind the founder only when it is time (founder, 28/10/2026)", () => {
  it("today: nothing to spend — the database 6%, files 1%, connections 48%, RAM 52%, CPU 28%; Docker's memory is engineering's", () => {
    const items = capacityItems(TODAY, "2026-10-28")
    assert.deepEqual(items.filter((i) => i.level !== "ok").map((i) => [i.key, i.level, i.owner]), [["dockerd", "warn", "engineering"]])
    assert.deepEqual([at(items, "db").pct, at(items, "storage").pct, at(items, "conns").pct, at(items, "ram").pct, at(items, "cpu").pct], [6, 1, 48, 52, 28])
    assert.deepEqual(dueReminders(items, {}, Date.now()), [])
  })
  it("full enough to act: the database at 85% of the Free plan's 500 MB, 500 accounts, CPU at 85%", () => {
    const items = capacityItems({ ...TODAY, db_bytes: 430 * MB, accounts: 500, load15: 1.7 }, "2026-10-28")
    assert.deepEqual([at(items, "db").level, at(items, "accounts").level, at(items, "cpu").level], ["act", "act", "act"])
    assert.equal(at(items, "db").used, "430 MB")
  })
  it("a build's CPU and RAM are never a reason to spend", () => {
    const items = capacityItems({ ...TODAY, building: true, ram_pct: 97, load15: 2 }, "2026-10-28")
    assert.deepEqual([at(items, "ram").level, at(items, "cpu").level], ["ok", "ok"])
  })
  it("regression: «CPU 99%» seven minutes after a deploy (the real load 9%) — the 15-minute average still carried the build", () => {
    const after = capacityItems({ ...TODAY, load15: 1.98, build_ago_s: 7 * 60 }, "2026-10-28")
    assert.equal(at(after, "cpu").level, "ok")
    assert.equal(dueReminders(after, {}, Date.now()).some((i) => i.key === "cpu"), false)
    // Long after any build, a real sustained load still counts.
    assert.equal(at(capacityItems({ ...TODAY, load15: 1.98, build_ago_s: BUILD_SETTLE_S + 60 }, "2026-10-28"), "cpu").level, "act")
  })
  it("the Play Store decision from 01/12/2026 until the launch", () => {
    assert.equal(at(capacityItems(TODAY, "2026-11-30"), "launch").level, "ok")
    assert.equal(at(capacityItems(TODAY, "2026-12-01"), "launch").level, "act")
    assert.equal(capacityItems(TODAY, "2027-01-01").some((i) => i.key === "launch"), false)
  })
  it("told once, again only after 7 days if it is still there; engineering's items never reach the founder", () => {
    const items = capacityItems({ ...TODAY, db_bytes: 450 * MB, dockerd_mb: 2000 }, "2026-10-28")
    const now = Date.parse("2026-10-28T02:05:00Z")
    assert.deepEqual(dueReminders(items, {}, now).map((i) => i.key), ["db"])
    const sent = { db: { level: "act", sent_at: new Date(now - 3_600_000).toISOString() } }
    assert.deepEqual(dueReminders(items, sent, now), [])
    assert.deepEqual(dueReminders(items, sent, now + REMIND_EVERY_MS).map((i) => i.key), ["db"])
  })
  it("the message says what is full, what to do and what it costs — «បង», 0-9 digits", () => {
    const db = at(capacityItems({ ...TODAY, db_bytes: 430 * MB }, "2026-10-28"), "db")
    const text = reminderText(db)
    assert.match(text, /430 MB ក្នុងចំណោម 500 MB \(86%\)/)
    assert.match(text, /\$25\/ខែ/)
    for (const i of capacityItems({ ...TODAY, db_bytes: 450 * MB, storage_bytes: 1000 * MB, db_conns: 58, accounts: 600, ram_pct: 95, load15: 1.9 }, "2026-12-02"))
      if (i.owner === "founder") assert.doesNotMatch(reminderText(i), /លោក|[០-៩]/, i.key)
  })
  it("wired: the agent measures, the bot checks hourly and records only what reached a chat, the card in the Control Center", () => {
    if (existsSync(join(process.cwd(), "deploy/ops-agent.py"))) {
      const agent = read("deploy/ops-agent.py")
      assert.match(agent, /"capacity": capacity\(\),/)
      assert.match(agent, /pg_database_size\(current_database\(\)\)/)
    }
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await watchdogTick\(\)\n[^\n]*\n\s+await capacityTick\(\)/)
    assert.match(read("src/lib/server/capacity-reminder.ts"), /if \(reached > 0\) await botDb\(\)\.rpc\("bot_capacity_mark"/)
    assert.match(read("src/app/(app)/admin/super/control/page.tsx"), /<CapacityCard \/>/)
    const sql = read("supabase/migrations/20270272000000_capacity_reminders.sql")
    assert.equal((sql.match(/perform public\.require_bot\(p_key\);/g) ?? []).length, 3)
  })
})
