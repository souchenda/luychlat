import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nightlyDue, nightlyReportText } from "./nightly-report"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const facts = { day: "2026-10-19", healthy: true, issues: [], diskFreeGb: 52.3, diskPct: 33.1, ramPct: 61.2, ramTotalGb: 3.8, newUsers: 4, approvals: 7, dockerOk: true, webhookOk: true }

describe("The nightly report before midnight (founder, 19/10/2026)", () => {
  it("the founder's card on the executive summary: 📊 · 🚀 · one health line with new members and approvals · 🎯", () => {
    const text = nightlyReportText({ ...facts, staff: [{ name: "Dara", count: 5 }, { name: "Sok", count: 2 }], highlights: ["Members-only bot", "Auto-prune", "Caption edit"], patches: 12, actions: ["ចុច ✅ លើកាត #833"], others: { verify: 4, external: 3, engineering: 0 } })
    assert.equal(
      text,
      [
        "📊 App Luy Chlat · Daily Summary 19/10/2026",
        "",
        "🚀 Shipped today",
        "✅ Members-only bot",
        "✅ Auto-prune",
        "✅ Caption edit",
        "(+ 12 technical patches & fixes under the hood)",
        "",
        "🟢 System Health: Healthy (Disk: 52GB free, RAM: 61%, Webhook: OK)",
        "👥 New members: 4 · Approvals: 7 (Dara 5, Sok 2)",
        "",
        "🎯 Action Required (1)",
        "1. ចុច ✅ លើកាត #833",
        "",
        "Also open: 4 ready to test · 3 with outside reviewers · 0 with engineering",
      ].join("\n"),
    )
    assert.match(nightlyReportText({ ...facts, healthy: false, issues: ["disk"], webhookOk: false }), /🟠 System Health: Needs attention — disk \(Disk: 52GB free, RAM: 61%, Webhook: ERROR\)/)
    assert.match(nightlyReportText({ ...facts, dockerOk: false }), /🟠 System Health: Needs attention — docker/)
  })
  it("23:30–23:59 Cambodia time, once a day (claimed), to the founder's private chat", () => {
    assert.ok(nightlyDue(23, 30) && nightlyDue(23, 59))
    assert.ok(!nightlyDue(23, 29) && !nightlyDue(0, 0) && !nightlyDue(22, 45))
    const job = read("src/lib/server/nightly-report.ts")
    assert.match(job, /p_job: "nightly-report", p_day: day \}/)
    assert.match(job, /for \(const chat of await founderChats\(\)\)/) // the founder's private chat (20/10/2026)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await nightlyReportTick\(\)/)
  })
  it("regression: the end-of-day report went nowhere with no DevOps chat while logging «sent» — now the founder's chat, and the count is logged", () => {
    const eod = read("src/lib/server/dev-eod.ts")
    assert.match(eod, /await founderChats\(\)/)
    assert.match(eod, /sent to \$\{sent\} chat\(s\)/)
    assert.match(read("src/lib/server/admin-routes.ts"), /return o\.critical \|\| o\.founderFallback \? superAdminChats\(\) : \[\]/)
    assert.match(eod, /else if \(now\.hour < 6\) day/) // a deploy around midnight still sends yesterday's
    assert.ok(read("src/app/api/telegram/webhook/route.ts").includes("sendNightlyReport(phnomPenhToday().day)")) // /report on demand
  })
})

describe("Never silently skipped: the missed report catches up; the founder's morning briefing (20/10/2026)", () => {
  it("today's report from 23:30; a missed one until 06:00 the next morning; none in the day", async () => {
    const { nightlyReportDay } = await import("./nightly-report")
    assert.equal(nightlyReportDay("2026-10-19", 23, 30), "2026-10-19")
    assert.equal(nightlyReportDay("2026-10-20", 0, 25), "2026-10-19")
    assert.equal(nightlyReportDay("2026-10-20", 5, 59), "2026-10-19")
    assert.equal(nightlyReportDay("2026-10-20", 6, 0), null)
    assert.equal(nightlyReportDay("2026-10-20", 14, 0), null)
  })
  it("the briefing: 07:00 on 20/10/2026, once, to the founder's chat, with the server's real figures", async () => {
    const { MORNING_BRIEFING, morningBriefingText } = await import("./nightly-report")
    assert.deepEqual(MORNING_BRIEFING, { day: "2026-10-20", fromMinute: 420, untilMinute: 660 })
    const ok = morningBriefingText({ healthy: true, diskFreeGb: 51.2 })
    assert.match(ok, /^🌅 អរុណសួស្តី! របាយការណ៍សង្ខេបការងារយប់មិញ & សុខភាពប្រព័ន្ធ\n/)
    assert.match(ok, /Server ដំណើរការល្អ \(Disk ទំនេរ 51\.2 GB\)/)
    assert.match(morningBriefingText({ healthy: false, diskFreeGb: 9 }), /Server ត្រូវតាមដាន/) // never claims health it does not see
    assert.match(read("src/lib/server/nightly-report.ts"), /p_job: "morning-briefing"/)
  })
})

describe("Reports reach the founder's private chat only — «LCA Approval» stays an approval queue (founder, 20/10/2026)", () => {
  it("the nightly card, the morning briefing, the end-of-day report, the fuel sync status and new members: founderChats()", () => {
    for (const f of ["src/lib/server/nightly-report.ts", "src/lib/server/dev-eod.ts", "src/lib/server/moc-fuel-sync.ts", "src/lib/server/member-events.ts"]) {
      const src = read(f)
      assert.match(src, /await founderChats\(\)/, f)
      assert.doesNotMatch(src, /marketingChats\(/, f) // never the approval group
    }
    assert.match(read("src/lib/server/admin-routes.ts"), /export const founderChats = \(\) => superAdminChats\(\)/)
  })
})

describe("Staff performance in the founder's nightly card (founder, 20/10/2026)", () => {
  it("each approver's decisions today, most first, on the one 👥 line (the executive summary, 21/10/2026)", () => {
    const text = nightlyReportText({ ...facts, staff: [{ name: "Yerny", count: 5 }, { name: "ស៊ូ ចិន្ដា", count: 2 }] })
    assert.ok(text.includes("👥 New members: 4 · Approvals: 7 (Yerny 5, ស៊ូ ចិន្ដា 2)"))
    assert.ok(nightlyReportText({ ...facts, staff: [] }).includes("👥 New members: 4 · Approvals: 7\n"))
  })
  it("the counts come from the audited decisions (name and Telegram id, tip_chat_approver)", () => {
    const sql = read("supabase/migrations/20270198000000_post_decider_staff_stats.sql")
    assert.match(sql, /'by_approver'/)
    assert.ok(sql.includes("regexp_match(a.note, ' · by (.+) " + String.fromCharCode(92) + "(Telegram"), "the name and Telegram id as audited")
    assert.match(read("src/lib/server/nightly-report.ts"), /staff: \(stats\.by_approver/)
  })
})
