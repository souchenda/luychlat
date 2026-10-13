import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { atMinute, type PostKind, type PostStatus } from "../scheduled-posts"

import { createScheduler, type PostRow, type Preview, type SchedulerDeps } from "./scheduled-posts"

const ADMIN = 111
const STRANGER = 222
const DAY = "2026-10-16" // an ordinary Friday
const clock = (h: number, m: number) => Date.parse(atMinute(DAY, h * 60 + m))

/** An in-memory scheduled_posts table with the same once-only take() as the database. */
function fake(start: number) {
  let now = start
  const rows: PostRow[] = []
  const published: number[] = []
  const previewsSent: { chat: number; text: string; png: boolean }[] = []
  const edits: { msg: number; text: string; buttons: number }[] = []
  const answers: { text: string; alert: boolean }[] = []
  const deps: SchedulerDeps = {
    async schedule(kind: PostKind, postKey, payload, publishAt) {
      const found = rows.find((r) => r.kind === kind && r.post_key === postKey)
      if (found) return { ...found, created: false }
      const row: PostRow = { id: rows.length + 1, kind, post_key: postKey, payload, publish_at: publishAt, status: "PENDING", previews: [] }
      rows.push(row)
      return { ...row, created: true }
    },
    async take(id, status, chatId) {
      if (chatId !== undefined && chatId !== ADMIN) throw new Error("super admin only")
      const row = rows.find((r) => r.id === id)
      if (!row || row.status !== "PENDING") return null
      row.status = status as PostStatus
      return { ...row }
    },
    async get(id) {
      const row = rows.find((r) => r.id === id)
      return row ? { ...row } : null
    },
    async due() {
      return rows.filter((r) => r.status === "PENDING" && Date.parse(r.publish_at) <= now).map((r) => ({ ...r }))
    },
    async setPreviews(id, previews: Preview[]) {
      rows.find((r) => r.id === id)!.previews = previews
    },
    async adminChats() {
      return [ADMIN]
    },
    async content() {
      return { png: Buffer.from("png"), body: "☀️ អរុណសួស្តី" }
    },
    targets: () => ({ telegram: true, facebook: true }),
    async publish(row) {
      published.push(row.id)
    },
    async sendPreview(chat, png, text) {
      previewsSent.push({ chat, text, png: Boolean(png) })
      return 900 + previewsSent.length
    },
    async editPreview(p, text, buttons) {
      edits.push({ msg: p.msg, text, buttons: buttons.length })
    },
    async answer(_id, text, alert = false) {
      answers.push({ text, alert })
    },
    now: () => now,
    log: () => {},
  }
  const s = createScheduler(deps)
  const at = async (h: number, m: number) => {
    now = clock(h, m)
    await s.tick(DAY, h * 60 + m)
  }
  const press = (data: string, chat = ADMIN) => s.onCallback({ id: "cb", data, message: { message_id: 901, chat: { id: chat, type: "private" } } })
  return { rows, published, previewsSent, edits, answers, at, press, s }
}

describe("preview-first — the preview at 06:15", () => {
  it("nothing before 06:15; one preview at 06:15 with the destination; never sent twice", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 14)
    assert.equal(f.previewsSent.length, 0)
    await f.at(6, 15)
    assert.equal(f.previewsSent.length, 1)
    assert.match(f.previewsSent[0].text, /^📢 គោលដៅផ្សាយ៖ \[ ✈️ Telegram Channel \+ 🔵 Facebook Page \]/)
    assert.match(f.previewsSent[0].text, /នៅម៉ោង ០៧:០០ ព្រឹក ប្រសិនបើគ្មានសកម្មភាព។$/)
    assert.equal(f.previewsSent[0].png, true) // the poster, never text-only
    await f.at(6, 16)
    await f.at(6, 59)
    assert.equal(f.previewsSent.length, 1)
    assert.equal(f.published.length, 0)
  })
})

describe("preview-first — the buttons", () => {
  it("🚀 at 06:30 publishes once; the 07:00 timer then does nothing; the preview says ✅", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:p")
    assert.deepEqual(f.published, [1])
    assert.match(f.edits.at(-1)!.text, /✅ បានផ្សាយរួចរាល់$/)
    assert.equal(f.edits.at(-1)!.buttons, 0)
    await f.at(7, 0)
    await f.at(7, 1)
    assert.deepEqual(f.published, [1])
  })
  it("❌ pauses: the timer never publishes; the preview says ❌", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:x")
    await f.at(7, 0)
    assert.deepEqual(f.published, [])
    assert.match(f.edits.at(-1)!.text, /❌ បានផ្អាកការផ្សាយថ្ងៃនេះ$/)
  })
  it("🚀 pressed after the timer published: no second post, told it is already out", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(7, 0)
    await f.press("sp:1:p")
    assert.deepEqual(f.published, [1])
    assert.deepEqual(f.answers.at(-1), { text: "✅ បានផ្សាយរួចហើយ។", alert: true })
  })
  it("🚀 twice in a row: published once", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await Promise.all([f.press("sp:1:p"), f.press("sp:1:p")])
    assert.deepEqual(f.published, [1])
  })
  it("someone else's chat cannot decide", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:p", STRANGER)
    assert.deepEqual(f.published, [])
    assert.deepEqual(f.answers.at(-1), { text: "សម្រាប់ Super Admin ប៉ុណ្ណោះ។", alert: true })
  })
})

describe("preview-first — a fresh preview for a re-armed post", () => {
  it("paused, then re-armed (PENDING again, no previews, a later time): one fresh preview, then published at the new time", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:x")
    const row = f.rows[0]
    Object.assign(row, { status: "PENDING", previews: [], publish_at: new Date(clock(7, 40)).toISOString() })
    await f.at(7, 10)
    assert.equal(f.previewsSent.length, 2)
    await f.at(7, 11)
    assert.equal(f.previewsSent.length, 2)
    assert.deepEqual(f.published, [])
    await f.at(7, 40)
    assert.deepEqual(f.published, [1])
  })
})

describe("preview-first — the auto-publish fallback", () => {
  it("no action: published at 07:00 exactly once; the preview says ✅", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(6, 59)
    assert.deepEqual(f.published, [])
    await f.at(7, 0)
    await f.at(7, 1)
    await f.at(8, 0)
    assert.deepEqual(f.published, [1])
    assert.match(f.edits.at(-1)!.text, /✅ បានផ្សាយរួចរាល់$/)
  })
  it("the server was down until 07:20: no preview (too late), published at once", async () => {
    const f = fake(clock(7, 20))
    await f.at(7, 20)
    assert.equal(f.previewsSent.length, 0)
    assert.deepEqual(f.published, [1])
  })
  it("down until 08:30: nothing is posted hours late", async () => {
    const f = fake(clock(8, 30))
    await f.at(8, 30)
    assert.equal(f.rows.length, 0)
    assert.deepEqual(f.published, [])
  })
  it("a fuel change scheduled for 45 minutes later: preview now, published at its time", async () => {
    const f = fake(clock(12, 0))
    const publishAt = new Date(clock(12, 45)).toISOString()
    await f.s.schedulePost("FUEL", "notice-42", { telegram: "⛽ …", facebook: "⛽ …" }, publishAt)
    assert.equal(f.previewsSent.length, 1)
    await f.at(12, 44)
    assert.deepEqual(f.published, [])
    await f.at(12, 45)
    assert.deepEqual(f.published, [1])
  })
})
