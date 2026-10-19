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
  it("the timer: wait before; at the time publish ONLY an approved post, hold a pending one; expire past 90 minutes", () => {
    const at = atMinute("2026-10-16", 420)
    assert.equal(at, "2026-10-16T00:00:00.000Z")
    assert.equal(dueAction(at, Date.parse(at) - 1, "APPROVED"), "wait")
    assert.equal(dueAction(at, Date.parse(at), "APPROVED"), "publish")
    assert.equal(dueAction(at, Date.parse(at), "PENDING"), "hold")
    assert.equal(dueAction(at, Date.parse(at) + 90 * 60_000, "PENDING"), "hold")
    assert.equal(dueAction(at, Date.parse(at) + 91 * 60_000, "PENDING"), "expire")
    assert.equal(dueAction(at, Date.parse(at) + 91 * 60_000, "APPROVED"), "expire")
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
    assert.equal(lines.at(-1), "🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម — ចុច «✅ យល់ព្រម» ដើម្បីផ្សាយទៅ [ ✈️ Telegram Channel + 🔵 Facebook Page ] នៅម៉ោង ០៧:០០ ព្រឹក។")
    const tgOnly = previewText({ kind: "HOLIDAY", targets: { telegram: true, facebook: false }, publishAt: atMinute("2026-11-20", 1080), body: "x", status: "PENDING" })
    assert.equal(tgOnly.split("\n")[0], "📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel តែប៉ុណ្ណោះ ]")
    assert.match(tgOnly, /ផ្សាយទៅ \[ ✈️ Telegram Channel តែប៉ុណ្ណោះ \] នៅម៉ោង ១៨:០០ ល្ងាច/)
    assert.equal(kmClock(atMinute("2026-10-16", 13 * 60 + 45)), "១៣:៤៥ រសៀល")
  })
  it("after a decision the notice becomes the outcome, and the buttons go", () => {
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PUBLISHED" }), /✅ បានផ្សាយរួចរាល់$/)
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PAUSED" }), /❌ បានផ្អាកការផ្សាយថ្ងៃនេះ$/)
    assert.deepEqual(previewButtons(5, "PUBLISHED", { telegram: true, facebook: true }), [])
  })
  it("the buttons: ✅ approves for its time; 🚀 names the destination; ❌ pauses today", () => {
    assert.deepEqual(previewButtons(5, "PENDING", { telegram: true, facebook: true }), [
      [{ text: "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)", callback_data: "sp:5:a" }],
      [{ text: "🚀 ផុសភ្លាមៗ (Telegram + Facebook)", callback_data: "sp:5:p" }],
      [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: "sp:5:x" }],
    ])
    // Approved: publish now or pause; no second approval.
    assert.deepEqual(previewButtons(5, "APPROVED", { telegram: true, facebook: true }).map((r) => r[0].callback_data), ["sp:5:p", "sp:5:x"])
    assert.equal(previewButtons(5, "PENDING", { telegram: true, facebook: false })[1][0].text, "🚀 ផុសភ្លាមៗ (Telegram)")
    assert.deepEqual(parseScheduledPostCallback("sp:5:a"), { id: 5, action: "approve" })
    assert.deepEqual(parseScheduledPostCallback("sp:5:p"), { id: 5, action: "publish" })
    assert.deepEqual(parseScheduledPostCallback("sp:5:x"), { id: 5, action: "pause" })
    assert.equal(parseScheduledPostCallback("sp:x:p"), null)
  })
})

describe("Who decided, on the card (founder, 20/10/2026)", () => {
  const where = "✈️ Telegram Channel + 🔵 Facebook Page"
  const at = "2026-10-21T00:00:00Z" // 07:00 Cambodia
  const d = { name: "Yerny", username: "yernysou", at: "2026-10-20T23:32:00Z", how: "approve" as const }
  it("✅ / 🚀 / ❌ with the name, @username and Cambodia time", async () => {
    const { deciderLine } = await import("./scheduled-posts")
    assert.equal(deciderLine("APPROVED", where, at, d), `✅ បានយល់ព្រមដោយ៖ 👤 Yerny (@yernysou)\n⏰ ម៉ោងអនុម័ត៖ ០៦:៣២ ព្រឹក\n📢 នឹងផ្សាយទៅ [ ${where} ] នៅម៉ោង ០៧:០០ ព្រឹក។`)
    assert.equal(deciderLine("PUBLISHED", where, at, { ...d, how: "publish" }), "🚀 បានបាញ់ផ្សាយភ្លាមៗដោយ៖ 👤 Yerny (@yernysou)\n⏰ ម៉ោងផ្សាយ៖ ០៦:៣២ ព្រឹក")
    assert.equal(deciderLine("PAUSED", where, at, { ...d, how: "pause", username: null }), "❌ ត្រូវបានផ្អាកដោយ៖ 👤 Yerny\n⏰ ម៉ោងផ្អាក៖ ០៦:៣២ ព្រឹក")
  })
  it("nobody named, or a status the tap did not make (expired): the plain status line", async () => {
    const { deciderLine } = await import("./scheduled-posts")
    assert.equal(deciderLine("APPROVED", where, at, { ...d, name: null, username: null }), null)
    assert.equal(deciderLine("EXPIRED", where, at, d), null)
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "EXPIRED", decider: d }), /⌛ មិនបានផ្សាយ/)
  })
})
