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
    assert.equal(DILEMMA_CTA, "📊 ចង់ដឹងសុខភាពហិរញ្ញវត្ថុ និងគណនា DTI របស់អ្នក? សាកល្បងឥតគិតថ្លៃលើ អេប លុយឆ្លាត 👉 app.luychlat.com")
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
