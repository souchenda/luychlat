import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { DILEMMA_CTA, dilemmaOfDay, dilemmaPostText, MONEY_DILEMMAS } from "./money-dilemmas"
import { channelFor } from "./islamic-channel"
import { plannedPosts } from "./scheduled-posts"
import { shouldPublishToFacebook } from "./server/facebook-publisher"

// 2026-10-20 Tuesday · 21 Wednesday · 23 Friday
describe("Money dilemmas for the community and the Facebook Page (founder, 18/10/2026)", () => {
  it("every post ends with the call to the app, word for word", () => {
    // «DTI» explained in plain Khmer (founder, 20/10/2026 — the bare word confused people).
    assert.equal(
      DILEMMA_CTA,
      [
        "📊 ចង់ដឹងសុខភាពហិរញ្ញវត្ថុ និងគណនាបន្ទុកបំណុលធៀបនឹងចំណូល (DTI) របស់អ្នក?",
        "(DTI គឺជារង្វាស់ថាតើបងចំណាយប៉ុន្មាន % នៃចំណូលប្រចាំខែទៅលើបំណុល)",
        "👉 គណនាឥតគិតថ្លៃលើ អេប លុយឆ្លាត៖ app.luychlat.com",
      ].join("\n"),
    )
    for (const d of MONEY_DILEMMAS) {
      const text = dilemmaPostText(d)
      assert.ok(text.endsWith(DILEMMA_CTA), d.id)
      assert.ok(text.includes(`❓ ${d.question}`), d.id)
      assert.match(text, /comment/)
      assert.doesNotMatch(text, /<i>|កម្មវិធី|អែប/) // no italics; the brand is «អេប លុយឆ្លាត»
    }
    assert.equal(new Set(MONEY_DILEMMAS.map((d) => d.id)).size, MONEY_DILEMMAS.length)
  })
  it("Tuesday and Friday 18:30, previewed 45 min before; a different dilemma each posting day", () => {
    const has = (day: string, min: number) => plannedPosts(day, min).some((p) => p.kind === "DILEMMA")
    assert.ok(has("2026-10-20", 17 * 60 + 45))
    assert.ok(has("2026-10-23", 17 * 60 + 45))
    assert.ok(!has("2026-10-21", 17 * 60 + 45))
    assert.ok(!has("2026-10-20", 17 * 60 + 44))
    assert.notEqual(dilemmaOfDay("2026-10-20").id, dilemmaOfDay("2026-10-23").id)
  })
  it("the general channel and the Facebook Page — never the Islamic channel", () => {
    assert.equal(channelFor("DILEMMA"), "community")
    assert.equal(shouldPublishToFacebook({ kind: "dilemma" }), true)
  })
  it("published through the approval (the same text on Telegram and the Page); the database accepts the kind", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    const block = sp.slice(sp.indexOf('if (row.kind === "DILEMMA") {', sp.indexOf("async publish(row)")), sp.indexOf('if (row.kind === "HOLYDAY") {', sp.indexOf("async publish(row)")))
    assert.match(block, /sentText\(text, false\)/)
    assert.match(block, /publishTextToFacebook\(approval, text\)/)
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270177000000_money_dilemma_posts.sql"), "utf8"), /'DILEMMA'/)
  })
})

describe("In-app Islamic quiz — Islamic Mode users only", () => {
  it("the card renders nothing unless Islamic Mode is on, and lives only on /islamic (whose layout locks the page)", () => {
    const card = readFileSync(join(process.cwd(), "src/components/islamic/quiz-card.tsx"), "utf8")
    assert.match(card, /const islamic = useIslamicEnabled\(\)\s+if \(!islamic \|\| !today \|\| !set\.length\) return null/)
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/islamic/layout.tsx"), "utf8")
    assert.match(layout, /IslamicModeOff/)
    const users = ["src/app/(app)/islamic/page.tsx"]
    assert.match(readFileSync(join(process.cwd(), users[0]), "utf8"), /<IslamicQuizCard \/>/)
  })
})

describe("The money dilemma as an A / B poster (founder, 20/10/2026)", () => {
  it("«សងបំណុលមុន ឬទុកប្រាក់បម្រុងមុន?»: the founder's words; no parentheses on the graphic; renders whole at 1080 × 1080", async () => {
    const d = MONEY_DILEMMAS.find((x) => x.id === "debt-or-savings")!
    assert.deepEqual(d.poster, {
      headline: "មានលុយសល់ $១,០០០ ក្នុងដៃ...",
      a: { title: "សងកាតឥណទានមុន", sub: "កាត់បន្ថយការប្រាក់ ១៨%/ឆ្នាំ", icon: "card", tone: "warm" },
      b: { title: "ទុកប្រាក់បម្រុងមុន", sub: "ការពារពេលមានអាសន្ន", icon: "shield", tone: "calm" },
      prompt: "តើគួររើសមួយណា? A ឬ B?",
    })
    for (const x of MONEY_DILEMMAS.filter((m) => m.poster)) {
      const p = x.poster!
      assert.doesNotMatch([p.headline, p.a.title, p.a.sub, p.b.title, p.b.sub, p.prompt].join(" "), /[()]/, x.id)
    }
    const { posterAssetsReady } = await import("./server/poster-kit")
    const { renderDilemmaPoster } = await import("./server/dilemma-poster")
    await posterAssetsReady
    const r = renderDilemmaPoster(d.poster!)
    assert.equal(r.truncated, false)
    assert.deepEqual([r.png.readUInt32BE(16), r.png.readUInt32BE(20)], [1080, 1080])
  })
  it("regression: the canvas poster was rejected as a wireframe (founder, 20/10/2026) — it is OFF: no card or post carries it", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { DILEMMA_POSTERS_ENABLED } = await import("./money-dilemmas")
    assert.equal(DILEMMA_POSTERS_ENABLED, false) // turning it on is the founder's decision, with a high-fidelity template
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /png: DILEMMA_POSTERS_ENABLED && d\.poster \? poster\(\(\) => renderDilemmaPoster\(d\.poster!\)\.png\) : null, body: dilemmaPostText\(d\)/)
    assert.match(sp, /const png = DILEMMA_POSTERS_ENABLED && d\.poster \? renderDilemmaPoster\(d\.poster\)\.png : null/)
    // Never ungated: every use of the poster sits behind the switch.
    assert.equal((sp.match(/d\.poster \?/g) ?? []).length, (sp.match(/DILEMMA_POSTERS_ENABLED && d\.poster \?/g) ?? []).length)
    // Tonight's dilemma: cancelled for good, published nowhere.
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270235000000_dilemma_cancelled.sql"), "utf8"), /set status = 'PAUSED', payload = payload - 'repreview'\n where kind = 'DILEMMA' and post_key = '2026-10-20' and status in \('PENDING', 'APPROVED'\)/)
  })
})
