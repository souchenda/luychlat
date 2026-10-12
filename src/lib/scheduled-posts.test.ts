import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { atMinute, dueAction, kmClock, parseScheduledPostCallback, plannedPosts, previewButtons, previewText, targetLabel } from "./scheduled-posts"

describe("scheduled posts — the preview window", () => {
  it("the 07:00 post: nothing at 06:14, its preview from 06:15, still scheduled until 08:29", () => {
    assert.equal(plannedPosts("2026-10-16", 6 * 60 + 14).length, 0)
    assert.deepEqual(plannedPosts("2026-10-16", 6 * 60 + 15), [{ kind: "MORNING", postKey: "2026-10-16", publishMinute: 420, payload: { day: "2026-10-16" } }])
    assert.equal(plannedPosts("2026-10-16", 8 * 60 + 29).length, 1)
    assert.equal(plannedPosts("2026-10-16", 8 * 60 + 30).length, 0)
  })
  it("holiday notes: the eve's preview at 17:15 (for 18:00), the day back's at 06:45 (for 07:30)", () => {
    assert.equal(plannedPosts("2026-11-20", 17 * 60 + 14).length, 0)
    assert.deepEqual(plannedPosts("2026-11-20", 17 * 60 + 15).map((p) => [p.kind, p.postKey, p.publishMinute]), [["HOLIDAY", "2026-11-20-pre", 1080]])
    const back = plannedPosts("2026-11-26", 6 * 60 + 45)
    assert.deepEqual(back.map((p) => [p.kind, p.postKey]), [["MORNING", "2026-11-26"], ["HOLIDAY", "2026-11-26-post"]])
  })
  it("the timer: wait before, publish at the time, expire past 90 minutes", () => {
    const at = atMinute("2026-10-16", 420)
    assert.equal(at, "2026-10-16T00:00:00.000Z")
    assert.equal(dueAction(at, Date.parse(at) - 1), "wait")
    assert.equal(dueAction(at, Date.parse(at)), "publish")
    assert.equal(dueAction(at, Date.parse(at) + 90 * 60_000), "publish")
    assert.equal(dueAction(at, Date.parse(at) + 91 * 60_000), "expire")
  })
})

describe("scheduled posts — the preview names its destination", () => {
  const at = atMinute("2026-10-16", 420)
  it("both, Telegram only, Facebook only", () => {
    assert.equal(targetLabel({ telegram: true, facebook: true }), "✈️ Telegram Channel + 🔵 Facebook Page")
    assert.equal(targetLabel({ telegram: true, facebook: false }), "✈️ Telegram Channel តែប៉ុណ្ណោះ")
    assert.equal(targetLabel({ telegram: false, facebook: true }), "🔵 Facebook Page តែប៉ុណ្ណោះ")
  })
  it("the badge on top, the post, then the auto-publish notice with the same destination and «០៧:០០ ព្រឹក»", () => {
    const text = previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "☀️ …", status: "PENDING" })
    const lines = text.split("\n")
    assert.equal(lines[0], "📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel + 🔵 Facebook Page ]")
    assert.equal(lines.at(-1), "⏰ នឹងផ្សាយស្វ័យប្រវត្តិទៅកាន់ [ ✈️ Telegram Channel + 🔵 Facebook Page ] នៅម៉ោង ០៧:០០ ព្រឹក ប្រសិនបើគ្មានសកម្មភាព។")
    const tgOnly = previewText({ kind: "HOLIDAY", targets: { telegram: true, facebook: false }, publishAt: atMinute("2026-11-20", 1080), body: "x", status: "PENDING" })
    assert.equal(tgOnly.split("\n")[0], "📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel តែប៉ុណ្ណោះ ]")
    assert.match(tgOnly, /ទៅកាន់ \[ ✈️ Telegram Channel តែប៉ុណ្ណោះ \] នៅម៉ោង ១៨:០០ ល្ងាច/)
    assert.equal(kmClock(atMinute("2026-10-16", 13 * 60 + 45)), "១៣:៤៥ រសៀល")
  })
  it("after a decision the notice becomes the outcome, and the buttons go", () => {
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PUBLISHED" }), /✅ បានផ្សាយរួចរាល់$/)
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PAUSED" }), /❌ បានផ្អាកការផ្សាយថ្ងៃនេះ$/)
    assert.deepEqual(previewButtons(5, "PUBLISHED", { telegram: true, facebook: true }), [])
  })
  it("the buttons: 🚀 names the destination; ❌ pauses today", () => {
    assert.deepEqual(previewButtons(5, "PENDING", { telegram: true, facebook: true }), [
      [{ text: "🚀 ផុសភ្លាមៗ (Telegram + Facebook)", callback_data: "sp:5:p" }],
      [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: "sp:5:x" }],
    ])
    assert.equal(previewButtons(5, "PENDING", { telegram: true, facebook: false })[0][0].text, "🚀 ផុសភ្លាមៗ (Telegram)")
    assert.deepEqual(parseScheduledPostCallback("sp:5:p"), { id: 5, action: "publish" })
    assert.deepEqual(parseScheduledPostCallback("sp:5:x"), { id: 5, action: "pause" })
    assert.equal(parseScheduledPostCallback("sp:x:p"), null)
  })
})
