import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nightlyDue, nightlyReportText } from "./nightly-report"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const facts = { day: "2026-10-19", healthy: true, issues: [], diskFreeGb: 52.3, diskPct: 33.1, ramPct: 61.2, ramTotalGb: 3.8, newUsers: 4, approvals: 7, dockerOk: true, webhookOk: true }

describe("The nightly report before midnight (founder, 19/10/2026)", () => {
  it("the founder's card: date, health, disk, RAM, new members, approvals, Docker & webhook", () => {
    assert.equal(
      nightlyReportText(facts),
      [
        "📊 របាយការណ៍ប្រចាំថ្ងៃ & សុខភាព Server (មុនម៉ោង ១២ យប់)",
        "• កាលបរិច្ឆេទ៖ ១៩/១០/២០២៦",
        "• ស្ថានភាព Server៖ 🟢 សកម្មធម្មតា (Healthy)",
        "• ទំហំថាសរឹង (Disk)៖ 52.3 GB ទំនេរ (33.1% ប្រើប្រាស់)",
        "• ការចងចាំ (RAM)៖ 61.2% នៃ 3.8 GB",
        "• សមាជិកថ្មីថ្ងៃនេះ៖ 4",
        "• ការអនុម័តថ្ងៃនេះ៖ 7",
        "• ស្ថានភាព Docker & Webhook៖ ដំណើរការល្អ",
        "— ប្រព័ន្ធស្វ័យប្រវត្តិ អេប លុយឆ្លាត",
      ].join("\n"),
    )
    assert.match(nightlyReportText({ ...facts, healthy: false, issues: ["disk"], webhookOk: false }), /🟠 ត្រូវតាមដាន \(disk\)[\s\S]*Webhook មានបញ្ហា/)
  })
  it("23:30–23:59 Cambodia time, once a day (claimed), to «LCA Approval»", () => {
    assert.ok(nightlyDue(23, 30) && nightlyDue(23, 59))
    assert.ok(!nightlyDue(23, 29) && !nightlyDue(0, 0) && !nightlyDue(22, 45))
    const job = read("src/lib/server/nightly-report.ts")
    assert.match(job, /p_job: "nightly-report", p_day: now\.day/)
    assert.match(job, /for \(const chat of await marketingChats\(\)\)/)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await nightlyReportTick\(\)/)
  })
  it("regression: the end-of-day report went nowhere with no DevOps chat while logging «sent» — now the founder's chat, and the count is logged", () => {
    const eod = read("src/lib/server/dev-eod.ts")
    assert.match(eod, /await devopsChats\(\{ founderFallback: true \}\)/)
    assert.match(eod, /sent to \$\{sent\} chat\(s\)/)
    assert.match(read("src/lib/server/admin-routes.ts"), /return o\.critical \|\| o\.founderFallback \? superAdminChats\(\) : \[\]/)
  })
})
