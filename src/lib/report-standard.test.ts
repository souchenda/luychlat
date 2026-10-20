import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { curate, executiveSummary, FLAG, headline, healthLine, ownerTag, paginate, TRUNCATION } from "./report-standard"
import { eodText, type Report } from "./server/dev-eod"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const h = (n: number) => `${String(n).padStart(7, "a")}${"0".repeat(33)}`

describe("The Reporting Standard — an executive summary (founder, 21/10/2026)", () => {
  it("highlights: 3–5 curated ROADMAP items, topped up from feature commits; X = today's commits no highlight names", () => {
    const commits = Array.from({ length: 70 }, (_, i) => h(i + 1))
    const done = [
      { title: "Members-only bot", hashes: [h(1).slice(0, 7), h(2).slice(0, 7)] },
      { title: "Auto-prune", hashes: [h(3).slice(0, 7)] },
    ]
    const features = [{ hash: h(1), subject: "feat already cited" }, { hash: h(9), subject: "Caption edit by reply" }, { hash: h(10), subject: "Footer" }]
    const r = curate(done, features, commits)
    assert.deepEqual(r.highlights, ["Members-only bot", "Auto-prune", "Caption edit by reply"]) // topped up to 3, no repeat
    assert.equal(r.patches, 70 - 4) // h1, h2, h3, h9 are named by a highlight
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `item ${i}`, hashes: [h(i + 1).slice(0, 7)] }))
    assert.equal(curate(many, [], commits).highlights.length, 5) // never more than five
    assert.equal(curate(many, [], commits).patches, 65)
    // The major ones first: an item that shipped a feature, then the most recent work.
    const ranked = curate(
      [
        { title: "Old fix", hashes: [h(1).slice(0, 7)] },
        { title: "Late fix", hashes: [h(60).slice(0, 7)] },
        { title: "A feature", hashes: [h(5).slice(0, 7)] },
      ],
      [{ hash: h(5), subject: "feat" }],
      commits,
    )
    assert.deepEqual(ranked.highlights, ["A feature", "Late fix", "Old fix"])
  })
  it("a highlight is its headline — the title up to « — », «; », «: » or « (», never cut mid-word, never «…»", () => {
    assert.equal(headline("The Android app offer on the prayer page — to hear the Adhan with the screen locked"), "The Android app offer on the prayer page")
    assert.equal(headline("Halal provision (Ibn Majah 925), worry & debt"), "Halal provision")
    assert.equal(headline("Halal finance lesson posters: the principle and its money takeaway"), "Halal finance lesson posters")
    assert.equal(headline("Toasts below the iPhone notch / Dynamic Island"), "Toasts below the iPhone notch / Dynamic Island")
  })
  it("one health line — no CPU-peak log lines", () => {
    assert.equal(healthLine({ okPct: 100, healthy: true, diskFreeGb: 53.4, ramPct: 47.2, webhookOk: true }), "🟢 System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)")
    assert.equal(healthLine({ healthy: true, diskFreeGb: 52, ramPct: 61, webhookOk: true }), "🟢 System Health: Healthy (Disk: 52GB free, RAM: 61%, Webhook: OK)")
    assert.equal(healthLine({ okPct: 96.4, healthy: false, issues: ["cpu"], diskFreeGb: null, ramPct: null, webhookOk: false }), "🟠 System Health: 96% Healthy — cpu (Disk: —, RAM: —, Webhook: ERROR)")
  })
  it("the layout: 📊 · 🚀 highlights and the patches line · the health line · 🎯 numbered founder actions — airy, no flags", () => {
    const text = executiveSummary({
      title: "App Luy Chlat · End of Day 20/10/2026",
      highlights: ["Members-only bot", "Auto-prune", "Caption edit"],
      patches: 67,
      health: "🟢 System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)",
      actions: ["ចុច ✅ លើកាត #833", "ជ្រើសអត្ថបទឌុអា", "ចុច ✅ លើកាត #833"],
      others: { verify: 9, external: 3, engineering: 0 },
      footer: "Full log: Admin › Super › Development",
    })
    assert.equal(
      text,
      [
        "📊 App Luy Chlat · End of Day 20/10/2026",
        "",
        "🚀 Shipped today",
        "✅ Members-only bot",
        "✅ Auto-prune",
        "✅ Caption edit",
        "(+ 67 technical patches & fixes under the hood)",
        "",
        "🟢 System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)",
        "",
        "🎯 Action Required (2)", // the same action twice is asked once
        "1. ចុច ✅ លើកាត #833",
        "2. ជ្រើសអត្ថបទឌុអា",
        "",
        "Also open: 9 ready to test · 3 with outside reviewers · 0 with engineering",
        "",
        "Full log: Admin › Super › Development",
      ].join("\n"),
    )
    assert.doesNotMatch(text, FLAG)
    assert.match(executiveSummary({ title: "t", highlights: [], patches: 0, health: "🟢", actions: [] }), /🎯 Action Required: nothing — all clear/)
  })
  it("regression: the 23:59 report dumped 70 commits, nine CPU-peak lines and «… +42 more» — now a phone-sized summary", () => {
    const report: Report = {
      day: "2026-10-20",
      commits: Array.from({ length: 70 }, (_, i) => ({ hash: h(i + 1), kind: i % 3 ? "fix" : "feat", scope: null, subject: `commit ${i + 1}` })),
      roadmap: Array.from({ length: 52 }, (_, i) => ({ title: `todo ${i}`, area: "other", status: "todo", priority: 2 })),
      done_today: [],
      security: {
        traffic: { total: 1000, blocked: 40, limited: 3, peak_blocked_per_min: 9, first_blocked: null, last_blocked: null },
        health: { max_cpu: 93.2, max_ram: 70, ok_pct: 100 },
        incidents: Array.from({ length: 9 }, () => ({ issue: "cpu", started_at: "2026-10-20T00:03:00Z", ended_at: "2026-10-20T00:05:00Z", minutes: 2, peak: 93.2 })),
      },
    }
    const text = eodText(report, {
      done: [{ title: "Members-only bot", hashes: [h(2).slice(0, 7)] }],
      actions: ["ចុច ✅ លើកាត #833"],
      now: { healthy: true, diskFreeGb: 53, ramPct: 47, webhookOk: true },
    })
    assert.ok(text.length < 900, `${text.length} characters`)
    assert.doesNotMatch(text, /commit (5|6|7)\d\b|CPU peak|peak 93|todo 1\d|more\b/)
    assert.doesNotMatch(text, TRUNCATION)
    assert.doesNotMatch(text, FLAG)
    assert.match(text, /🚀 Shipped today\n✅ Members-only bot\n✅ commit 1\n✅ commit 4\n\(\+ 67 technical patches & fixes under the hood\)/)
    assert.match(text, /🟢 System Health: 100% Healthy \(Disk: 53GB free, RAM: 47%, Webhook: OK\)/)
    assert.match(text, /🎯 Action Required \(1\)\n1\. ចុច ✅ លើកាត #833/)
  })
  it("the owner is the explicit tag that starts a reason — never guessed from its words", () => {
    assert.deepEqual(ownerTag("🟡 ចុច ✅ លើកាត #833"), { owner: "founder", action: "ចុច ✅ លើកាត #833" })
    assert.deepEqual(ownerTag("⏳ អ៊ីម៉ាំពិនិត្យ"), { owner: "external", action: "អ៊ីម៉ាំពិនិត្យ" })
    assert.deepEqual(ownerTag("⚙️ សាងសង់ APK"), { owner: "engineering", action: "សាងសង់ APK" })
    assert.deepEqual(ownerTag("🟢៖ សាកល្បង"), { owner: "verify", action: "សាកល្បង" })
    assert.equal(ownerTag("រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ"), null)
  })
  it("the safety net: a report over Telegram's limit goes as numbered parts, every character kept, in order", () => {
    const text = Array.from({ length: 400 }, (_, i) => `${i + 1}. ${"ក".repeat(20)}`).join("\n")
    const pages = paginate(text)
    assert.ok(pages.length > 1)
    pages.forEach((p, i) => {
      assert.ok(p.length <= 3900)
      assert.ok(p.startsWith(`(${"០១២៣៤៥៦៧៨៩"[i + 1]}/${"០១២៣៤៥៦៧៨៩"[pages.length]})\n`))
    })
    assert.equal(pages.map((p) => p.slice(p.indexOf("\n") + 1)).join("\n"), text)
    assert.deepEqual(paginate("short"), ["short"])
  })
  it("both reports are built on it; no module cuts or caps; ROADMAP.md is tagged; CLAUDE.md documents it", () => {
    for (const s of ["   … និង 4 ទៀត", "… +42 more", "and 3 more"]) assert.match(s, TRUNCATION)
    for (const f of ["src/lib/roadmap-scorecard.ts", "src/lib/server/nightly-report.ts", "src/lib/server/dev-eod.ts", "src/lib/nightly-report.ts"]) {
      assert.doesNotMatch(read(f), /… និង \$\{|… \+\$\{|more`|\.slice\(0, ?\d{4}\)|const short = |groupByArea|max_cpu \?\?/, f)
    }
    assert.match(read("src/lib/nightly-report.ts"), /return executiveSummary\(\{/)
    assert.match(read("src/lib/server/dev-eod.ts"), /return executiveSummary\(\{/)
    for (const f of ["src/lib/server/nightly-report.ts", "src/lib/server/dev-eod.ts"]) assert.match(read(f), /paginate\(text\)/, f)
    if (existsSync(join(process.cwd(), "ROADMAP.md"))) {
      const blocked = read("ROADMAP.md").split("\n").filter((l) => /^- \[[ x/]\] /.test(l) && l.includes("⛔"))
      assert.ok(blocked.length > 5)
      for (const l of blocked) assert.ok(ownerTag(l.split("⛔").slice(1).join("⛔")), l.slice(0, 80))
    }
    const claude = read("CLAUDE.md")
    assert.match(claude, /## Reporting Standards/)
    assert.match(claude, /\(\+ X technical patches & fixes under the hood\)/)
  })
})
