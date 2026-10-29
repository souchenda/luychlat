import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { FAMILIAR, FAMILIAR_MINUTE, FAMILIAR_START, FAMILIAR_WEEKDAY, familiarOfDay, familiarPoster, familiarPostText } from "./familiar"
import { plannedPosts } from "./scheduled-posts"
import { shouldPublishToFacebook } from "./server/facebook-publisher"

describe("«ធ្លាប់ទេ?» — a pain the reader knows, and the app's answer (founder, 29/10/2026)", () => {
  it("twelve, each a question, an answer and how — 0-9 digits, distinct ids", () => {
    assert.equal(FAMILIAR.length, 12)
    assert.equal(new Set(FAMILIAR.map((f) => f.id)).size, 12)
    for (const f of FAMILIAR) {
      assert.match(f.question, /\?$/, f.id)
      assert.match(f.answer, /។$/, f.id)
      assert.match(f.how, /។$/, f.id)
      assert.doesNotMatch(`${f.question}${f.answer}${f.how}`, /[០-៩]/, `${f.id}: Khmer digits`)
      assert.doesNotMatch(`${f.question}${f.answer}${f.how}`, /កម្មវិធី|អែប/, f.id)
    }
  })
  it("Wednesday 18:30, one a week from 4 November 2026, in turn — never before the start", () => {
    assert.equal(FAMILIAR_WEEKDAY, 3)
    assert.equal(FAMILIAR_MINUTE, 18 * 60 + 30)
    assert.equal(FAMILIAR_START, "2026-11-04")
    assert.equal(familiarOfDay("2026-11-04").id, "month-end")
    assert.equal(familiarOfDay("2026-11-11").id, "lent-family")
    assert.equal(familiarOfDay("2027-01-27").id, "month-end") // twelve weeks later, round again
    const at = (day: string) => plannedPosts(day, 18 * 60).some((p) => p.kind === "FAMILIAR")
    assert.equal(at("2026-11-04"), true)
    assert.equal(at("2026-10-28"), false) // a Wednesday before the start
    assert.equal(at("2026-11-05"), false) // a Thursday
  })
  it("the poster: the question as the headline, the answer last (the gold takeaway); the caption fits a photo", () => {
    const f = FAMILIAR[1]
    const p = familiarPoster(f)
    assert.equal(p.title, f.question) // «ធ្លាប់ទេ?» is the tag above it, never twice
    assert.ok(p.body.endsWith(f.answer))
    for (const x of FAMILIAR) assert.ok(familiarPostText(x).length < 600, x.id) // + the footer, under Telegram's 1,024
    assert.match(familiarPostText(f), /app\.luychlat\.com/)
  })
  it("the community channel and the Page — creative, so never auto-published", async () => {
    assert.equal(shouldPublishToFacebook({ kind: "familiar" }), true)
    const { AUTO_PUBLISH_KINDS } = await import("./scheduled-posts")
    assert.ok(!AUTO_PUBLISH_KINDS.includes("FAMILIAR" as never))
  })
})
