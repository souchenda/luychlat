// GOLDEN PATH 2 — Publisher pipeline (preview-first, curated Facebook, one pause for every channel).
// Founder, 18/10/2026: zero public posts without the founder's approval. Founder, 20/10/2026 (the founder's decision,
// replacing it): zero-pressure fallback — a daily post nobody approved or paused is published on schedule; ❌ still stops
// it; humour (and the event posts: fuel, festival posters) still never goes out without a tap.
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { atMinute, autoFallback, plannedPosts, previewText, takeAllowed, type PostKind } from "../../src/lib/scheduled-posts"
import { shouldPublishToFacebook } from "../../src/lib/server/facebook-publisher"
import { createScheduler, type PostRow, type SchedulerDeps } from "../../src/lib/server/scheduled-posts"

const DAY = "2026-10-16"
const at = (h: number, m: number) => Date.parse(atMinute(DAY, h * 60 + m))

function harness(start: number) {
  let now = start
  const rows: PostRow[] = []
  const published: number[] = []
  const previews: string[] = []
  const deps: SchedulerDeps = {
    async schedule(kind: PostKind, postKey, payload, publishAt) {
      const found = rows.find((r) => r.kind === kind && r.post_key === postKey)
      if (found) return { ...found, created: false }
      const row: PostRow = { id: rows.length + 1, kind, post_key: postKey, payload, publish_at: publishAt, status: "PENDING", previews: [] }
      rows.push(row)
      return { ...row, created: true }
    },
    async take(id, status, chatId) {
      if (chatId !== undefined && chatId !== 1) throw new Error("super admin only")
      const row = rows.find((r) => r.id === id)
      if (!row || !takeAllowed(row.status, status, chatId !== undefined)) return null
      row.status = status
      return { ...row }
    },
    async autoTake(id) {
      // As bot_post_auto_publish: a due PENDING post, not humour, at most 90 minutes late → PUBLISHED once.
      const row = rows.find((r) => r.id === id)
      const late = row ? now - Date.parse(row.publish_at) : -1
      if (!row || row.status !== "PENDING" || !autoFallback(row.kind) || late < 0 || late > 90 * 60_000) return null
      row.status = "PUBLISHED"
      return { ...row }
    },
    get: async (id) => rows.find((r) => r.id === id) ?? null,
    recordIds: async () => {},
    due: async () => rows.filter((r) => (r.status === "PENDING" || r.status === "APPROVED") && Date.parse(r.publish_at) <= now),
    async setPreviews(id, p) {
      rows.find((r) => r.id === id)!.previews = p
    },
    adminChats: async () => [1],
    content: async () => ({ png: Buffer.from("poster"), body: "☀️" }),
    targets: () => ({ telegram: true, facebook: true }),
    async publish(row) {
      published.push(row.id)
      return { telegram: 1, facebook: null }
    },
    async sendPreview(_chat, png, text) {
      assert.ok(png, "the morning preview is always a poster")
      previews.push(text)
      return previews.length
    },
    editPreview: async () => {},
    answer: async () => {},
    now: () => now,
    log: () => {},
  }
  const s = createScheduler(deps)
  return {
    published,
    previews,
    tick: async (h: number, m: number) => {
      now = at(h, m)
      await s.tick(DAY, h * 60 + m)
    },
    press: (data: string) => s.onCallback({ id: "cb", data, message: { message_id: 1, chat: { id: 1, type: "private" } } }),
  }
}

describe("GOLDEN 2 · publisher pipeline", () => {
  it("06:15 preview (poster, destination badge); NO decision → published on schedule at 07:00, exactly once (20/10/2026)", async () => {
    const h = harness(at(6, 0))
    await h.tick(6, 15)
    assert.equal(h.previews.length, 1)
    assert.match(h.previews[0], /^📢 គោលដៅផ្សាយ៖ \[ ✈️ Telegram Channel \+ 🔵 Facebook Page \]/)
    assert.match(h.previews[0], /នឹងផ្សាយស្វ័យប្រវត្តិ.+ចុច «❌» ដើម្បីផ្អាក/) // the approvers are told it goes out unless ❌
    await h.tick(6, 59)
    assert.deepEqual(h.published, []) // never early
    await h.tick(7, 0)
    await h.tick(7, 1)
    await h.tick(8, 31)
    assert.deepEqual(h.published, [1])
  })
  it("humour never goes out without a tap (the founder's hard rule stands)", () => {
    assert.equal(autoFallback("DILEMMA"), false)
    assert.equal(autoFallback("MORNING"), true)
  })
  it("✅ យល់ព្រម → published at 07:00 exactly once", async () => {
    const h = harness(at(6, 0))
    await h.tick(6, 15)
    await h.press("sp:1:a")
    await h.tick(6, 59)
    assert.deepEqual(h.published, [])
    await h.tick(7, 0)
    await h.tick(7, 1)
    assert.deepEqual(h.published, [1])
  })
  it("a tap's take never publishes from the timer; only the separate on-schedule fallback does, at the time (the database rule)", () => {
    assert.equal(takeAllowed("PENDING", "PUBLISHED", false), false)
    assert.equal(takeAllowed("APPROVED", "PUBLISHED", false), true)
  })
  it("❌ ផ្អាកថ្ងៃនេះ stops it; 🚀 never posts twice", async () => {
    const paused = harness(at(6, 0))
    await paused.tick(6, 15)
    await paused.press("sp:1:x")
    await paused.tick(7, 0)
    assert.deepEqual(paused.published, [])
    const now = harness(at(6, 0))
    await now.tick(6, 15)
    await now.press("sp:1:p")
    await now.press("sp:1:p")
    await now.tick(7, 0)
    assert.deepEqual(now.published, [1])
  })
  it("never posted hours late", () => {
    assert.equal(plannedPosts(DAY, 8 * 60 + 30).length, 0)
  })
  it("curated Facebook: morning / holiday / spotlight yes; the 20:00 reminder never; fuel only on a real change", () => {
    assert.equal(shouldPublishToFacebook({ kind: "morning" }), true)
    assert.equal(shouldPublishToFacebook({ kind: "evening" }), false)
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4100, diesel: 4200 }, previous: { regular: 4100, diesel: 4200 } }), false)
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: { regular: 4000, diesel: 4200 }, previous: { regular: 4100, diesel: 4200 } }), true)
  })
  it("the preview always names where it will go", () => {
    const text = previewText({ kind: "MORNING", targets: { telegram: true, facebook: false }, publishAt: atMinute(DAY, 420), body: "x", status: "PENDING" })
    assert.match(text, /✈️ Telegram Channel តែប៉ុណ្ណោះ/)
  })
})
