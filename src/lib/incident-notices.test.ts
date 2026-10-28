import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { type MessageKey, dictionaries } from "./i18n/dictionaries"
import { zh } from "./i18n/zh"
import { AUTO_NOTICE, MAINTENANCE_LEAD_MS, NOTICE_KINDS, visibleNotice } from "./incident-notices"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const NOW = Date.parse("2026-10-28T10:00:00Z")
const iso = (ms: number) => new Date(ms).toISOString()

describe("The incident kit: users read a prepared notice — nobody has to ask in the group (founder, 28/10/2026)", () => {
  it("shows the notice that is set, nothing when none (or an unknown one)", () => {
    assert.equal(visibleNotice({ kind: "bot_slow", starts_at: null, ends_at: null }, NOW), "bot_slow")
    assert.equal(visibleNotice({ kind: null, starts_at: null, ends_at: null }, NOW), null)
    assert.equal(visibleNotice({ kind: "free text", starts_at: null, ends_at: null }, NOW), null)
    assert.equal(visibleNotice(null, NOW), null)
  })
  it("planned maintenance: announced a day before, shown until it ends, then gone by itself", () => {
    const m = (start: number, end: number) => visibleNotice({ kind: "maintenance", starts_at: iso(start), ends_at: iso(end) }, NOW)
    assert.equal(m(NOW + MAINTENANCE_LEAD_MS - 1, NOW + MAINTENANCE_LEAD_MS + 3_600_000), "maintenance")
    assert.equal(m(NOW + MAINTENANCE_LEAD_MS + 1, NOW + MAINTENANCE_LEAD_MS + 3_600_000), null) // more than a day away
    assert.equal(m(NOW - 600_000, NOW + 600_000), "maintenance") // under way
    assert.equal(m(NOW - 3_600_000, NOW), null) // over
    assert.equal(visibleNotice({ kind: "maintenance", starts_at: null, ends_at: null }, NOW), null)
  })
  it("every notice is written in advance in km / en / zh — calm, with 0-9 digits, never «លោក»", () => {
    for (const k of NOTICE_KINDS)
      for (const part of ["title", "body"] as const) {
        const key = `notice.${k}.${part}` as MessageKey
        for (const [lang, text] of [["km", dictionaries.km[key]], ["en", dictionaries.en[key]], ["zh", zh[key]]] as const) {
          assert.ok(text && text.length > 5, `${lang} ${key}`)
          assert.doesNotMatch(text!, /[០-៩]|លោក|LuyChlat/, `${lang} ${key}`)
        }
      }
    // Data safety is said where people worry most.
    assert.match(dictionaries.km["notice.app_slow.body"], /ទិន្នន័យរបស់អ្នកមានសុវត្ថិភាព/)
    assert.match(dictionaries.km["notice.maintenance.body"], /ទិន្នន័យរបស់អ្នកមានសុវត្ថិភាព/)
  })
  it("the database: one notice, readable by all; set only by a super admin with 2FA (audited) or the watchdog — never free text", () => {
    const sql = read("supabase/migrations/20270269000000_app_notice.sql")
    assert.match(sql, /id smallint primary key default 1 check \(id = 1\)/)
    assert.match(sql, /kind text check \(kind in \('app_slow', 'bot_slow', 'bank_alerts_slow', 'maintenance'\)\)/)
    assert.doesNotMatch(sql, /\b(message|body|text_km|note) text\b/)
    const set = sql.slice(sql.indexOf("function public.ops_set_notice"), sql.indexOf("function public.bot_notice_auto"))
    assert.match(set, /perform public\.require_super_admin\(\);/)
    assert.match(set, /auth\.jwt\(\) ->> 'aal', ''\) <> 'aal2'/)
    assert.match(set, /perform public\.audit\('OPS_NOTICE'/)
    const auto = sql.slice(sql.indexOf("function public.bot_notice_auto"))
    assert.match(auto, /perform public\.require_bot\(p_key\);/)
    assert.match(auto, /where id = 1 and kind is null;/) // never replaces the founder's notice
    assert.match(auto, /where id = 1 and source = 'auto' and kind = p_kind;/) // clears only its own
  })
  it("automatic: the watchdog shows it when it pages the founder (5 minutes down) and clears it on recovery", () => {
    assert.deepEqual(AUTO_NOTICE, { db_down: "app_slow", webhook: "bot_slow" })
    const w = read("src/lib/server/health-watchdog.ts")
    assert.match(w, /await sendCritical\(alertText\(issue, sample\)\)\n\s+\/\/[^\n]*\n\s+await autoNotice\(issue, true\)/)
    assert.match(w, /await sendCritical\(recoveredText\([^\n]*\n\s+await autoNotice\(issue, false\)/)
  })
  it("seen in the app and on the sign-in page; the founder's one-tap panel is in the Control Center", () => {
    assert.match(read("src/app/(app)/layout.tsx"), /<AppNoticeBanner \/>\n\s+<WorkspaceLockedBanner/)
    assert.match(read("src/app/login/page.tsx"), /<AppNoticeBanner \/>/)
    assert.match(read("src/components/admin/control-center.tsx"), /<NoticePanel \/>/)
    assert.match(read("src/components/admin/notice-panel.tsx"), /rpc<null>\("ops_set_notice"/)
  })
})
