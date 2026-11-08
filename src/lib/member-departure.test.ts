import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { activityLines, departureAlertText } from "./activity-alerts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("A member who leaves is never silent (founder, 8/11/2026)", () => {
  it("regression: a member announced at 06:49 («សរុប 9 នាក់») vanished from Admin (8) with no card — now the founder is told", () => {
    const card = departureAlertText({ name: "Men Somanit", account: "067 553 667", at: "08/11/2026 07:30 AM", joined: "08/11/2026 06:49 AM", days: 0, self: true, total: 8 })
    assert.equal(
      card,
      [
        "👤 <b>សមាជិកបានលុបគណនី</b>",
        "• ឈ្មោះ/គណនី៖ Men Somanit · 067 553 667",
        "• របៀប៖ ម្ចាស់គណនីចុច «លុបគណនី» ដោយខ្លួនឯង",
        "• បានចុះឈ្មោះ៖ 08/11/2026 06:49 AM · នៅជាមួយ តិចជាង 1 ថ្ងៃ",
        "🕒 08/11/2026 07:30 AM · 📊 សមាជិកសរុប 8 នាក់",
      ].join("\n"),
    )
    const other = departureAlertText({ name: null, account: "a@b.c", at: "t", joined: null, days: null, self: false, total: 1234 })
    assert.match(other, /លុបពីផ្ទាំងគ្រប់គ្រង \(Supabase\)/)
    assert.doesNotMatch(other, /បានចុះឈ្មោះ/)
    assert.match(other, /សមាជិកសរុប 1,234 នាក់/)
    assert.match(departureAlertText({ name: "<b>x", account: "a", at: "t", joined: null, days: null, self: true, total: 1 }), /&lt;b&gt;x/)
    assert.doesNotMatch(card, /<i>|លោក|\$|៛/) // never italic Khmer, never «លោក», never money
  })
  it("wired: every removed sign-in is queued before its delete (never failing it); the founder's chat, quiet, counted", () => {
    const sql = read("supabase/migrations/20270298000000_member_departure_alerts.sql")
    assert.match(sql, /before delete on auth\.users/)
    assert.match(sql, /exception when others then\n {4}null;/)
    assert.match(sql, /revoke all on public\.member_departures from anon, authenticated/)
    const events = read("src/lib/server/member-events.ts")
    const fn = events.slice(events.indexOf("export async function flushDepartureAlerts"), events.indexOf('const BIRTHDAY_JOB'))
    assert.match(fn, /const chats = await founderChats\(\)/)
    assert.match(fn, /parse_mode: "HTML", disable_notification: true/)
    assert.match(fn, /Departure card delivered to \$\{delivered\}\/\$\{chats\.length\}/)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /if \(passes % 5 === 0\) await flushDepartureAlerts\(\)/)
  })
  it("what the member did (founder, 8/11/2026 — «ត្រូវដឹងថាគេចូលមកបានធ្វើអីខ្លះ»): counts and dates, never an amount", () => {
    const when = (iso: string) => iso.slice(11, 16)
    const lines = activityLines({ workspaces: 2, shared_in: 0, wallets: 3, entries: 1204, first_entry: "2026-11-08T06:55:00Z", last_entry: "2026-11-08T07:10:00Z", debts: 1, budgets: 0, bills: 2, telegram: true, islamic: false, tier: "FREE", last_active: "2026-11-08T07:20:00Z" }, when)
    assert.deepEqual(lines, [
      "• បានប្រើ៖ 1,204 ប្រតិបត្តិការ · 3 កាបូប · 1 បំណុល · 0 ថវិកា · 2 វិក្កយបត្រ",
      "• ប្រតិបត្តិការដំបូង 06:55 · ចុងក្រោយ 07:10",
      "• 2 workspace · ភ្ជាប់ Telegram · គម្រោង FREE",
      "• សកម្មចុងក្រោយ៖ 07:20",
    ])
    const none = activityLines({ workspaces: 2, shared_in: 0, wallets: 0, entries: 0, first_entry: null, last_entry: null, debts: 0, budgets: 0, bills: 0, telegram: false, islamic: true, tier: null, last_active: null }, when)
    assert.deepEqual(none, ["• បានប្រើ៖ មិនទាន់បានកត់ត្រាអ្វីទេ", "• 2 workspace · មិនបានភ្ជាប់ Telegram · Islamic Mode · គម្រោង FREE"])
    assert.deepEqual(activityLines(null, when), ["• សកម្មភាព៖ អានមិនបាន"])
    const card = departureAlertText({ name: "A", account: "b", at: "t", joined: "j", days: 2, self: true, total: 8, activity: lines })
    assert.match(card, /នៅជាមួយ 2 ថ្ងៃ\n• បានប្រើ៖ 1,204 ប្រតិបត្តិការ/)
    assert.doesNotMatch(card, /\$|៛|USD|KHR/)
    // Recorded BEFORE delete_my_account removes the ledger; counts only in the SQL (no amount column read).
    const sql = read("supabase/migrations/20270299000000_member_departure_activity.sql")
    const del = sql.slice(sql.indexOf("create or replace function public.delete_my_account"))
    assert.ok(del.indexOf("record_member_departure(uid, true)") < del.indexOf("delete from public.transactions"))
    const rec = sql.slice(sql.indexOf("create or replace function public.record_member_departure"), sql.indexOf("revoke all on function public.record_member_departure"))
    assert.doesNotMatch(rec, /amount|balance/)
  })
})
