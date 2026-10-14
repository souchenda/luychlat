import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { needsFounderApproval, sentencesOf, tipTextIssues } from "./tip-quality"
import { TIPS } from "./tips"

describe("every daily tip is a clear title and a complete insight (founder, 14/10/2026)", () => {
  it("all tips in the dataset pass: a real title, ≥ 2 full sentences ending «។»", () => {
    for (const t of TIPS) assert.deepEqual(tipTextIssues(t.title.km, t.body.km), [], `${t.id}: ${t.title.km}`)
  })
  it("the 14/10 incident: the comment «គ្រប់ចំនួន មិនមែនពេញចំនួនទេ» is flagged, never accepted silently", () => {
    assert.ok(tipTextIssues("បង់ប័ណ្ណឥណទានពេញចំនួន", "គ្រប់ចំនួន មិនមែនពេញចំនួនទេ").length >= 2)
  })
  it("a title starting with «ឬ» (the old «ឬ សងបំណុលតូចមុន») is flagged", () => {
    assert.ok(tipTextIssues("ឬ សងបំណុលតូចមុន", "បើត្រូវការកម្លាំងចិត្ត សងបំណុលតូចជាងគេមុន។ ការលុបបំណុលមួយៗ ជួយឱ្យយើងបន្ត។").some((i) => i.includes("ឬ")))
  })
  it("today's corrected card tip passes", () => {
    const t = TIPS.find((x) => x.id === "card-pay-full")!
    assert.equal(t.title.km, "បង់ប័ណ្ណឥណទានឱ្យគ្រប់ចំនួន")
    assert.deepEqual(tipTextIssues(t.title.km, t.body.km), [])
    assert.equal(sentencesOf(t.body.km).length, 2)
  })
})

describe("strict review: an edited or flagged tip waits for the founder's ✅", () => {
  const original = TIPS.find((x) => x.id === "card-pay-full")!
  it("the dataset's own text → may auto-publish at 12:00", () => {
    assert.equal(needsFounderApproval({ tip_id: original.id, title: original.title.km, body: original.body.km }, TIPS), false)
  })
  it("edited (the 14/10 reply), flagged, or not from the dataset → never auto-published", () => {
    assert.equal(needsFounderApproval({ tip_id: original.id, title: original.title.km, body: "គ្រប់ចំនួន មិនមែនពេញចំនួនទេ" }, TIPS), true)
    assert.equal(needsFounderApproval({ tip_id: original.id, title: "ចំណងជើងថ្មី", body: original.body.km }, TIPS), true)
    assert.equal(needsFounderApproval({ tip_id: null, title: original.title.km, body: original.body.km }, TIPS), true)
  })
})
