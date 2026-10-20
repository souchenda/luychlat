import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { atMinute, autoFallback, isAutoPublish, takeAllowed, type PostKind } from "../scheduled-posts"

import { createScheduler, type PostRow, type Preview, type SchedulerDeps } from "./scheduled-posts"

const ADMIN = 111
const STRANGER = 222
const DAY = "2026-10-16" // an ordinary Friday
const clock = (h: number, m: number) => Date.parse(atMinute(DAY, h * 60 + m))

/** An in-memory scheduled_posts table with the database's take() rule (takeAllowed = bot_post_take). */
function fake(start: number) {
  let now = start
  const rows: PostRow[] = []
  const published: number[] = []
  const recorded: { id: number; telegram: number | null; facebook: string | null }[] = []
  const previewsSent: { chat: number; text: string; png: boolean }[] = []
  const edits: { msg: number; text: string; buttons: number }[] = []
  const answers: { text: string; alert: boolean }[] = []
  const deps: SchedulerDeps = {
    async schedule(kind: PostKind, postKey, payload, publishAt) {
      const found = rows.find((r) => r.kind === kind && r.post_key === postKey)
      if (found) return { ...found, created: false }
      // As bot_post_schedule: a factual feed is created approved (public.post_auto_publish), the rest pending.
      const row: PostRow = { id: rows.length + 1, kind, post_key: postKey, payload, publish_at: publishAt, status: isAutoPublish(kind) ? "APPROVED" : "PENDING", previews: [] }
      rows.push(row)
      return { ...row, created: true }
    },
    async take(id, status, chatId) {
      if (chatId !== undefined && chatId !== ADMIN) throw new Error("super admin only")
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
      Object.assign(row, { status: "PUBLISHED", decided_how: "auto" })
      return { ...row }
    },
    async recordIds(id, ids) {
      recorded.push({ id, ...ids })
    },
    async setDecider(id, tg, name, username, how) {
      // As bot_post_set_decider: only the person who decided (a stranger never got past take()).
      if (tg !== ADMIN) return
      Object.assign(rows.find((r) => r.id === id)!, { decided_name: name, decided_username: username, decided_at: new Date(now).toISOString(), decided_how: how })
    },
    async get(id) {
      const row = rows.find((r) => r.id === id)
      return row ? { ...row } : null
    },
    async due() {
      return rows.filter((r) => (r.status === "PENDING" || r.status === "APPROVED") && Date.parse(r.publish_at) <= now).map((r) => ({ ...r }))
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
      return { telegram: 60 + row.id, facebook: `page_${row.id}` }
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
  /** A tap in the approval group («LCA Approval»): the person who tapped is checked, not the group. */
  const pressInGroup = (data: string, from: number, who: { first_name?: string; username?: string } = {}) => s.onCallback({ id: "cb", data, from: { id: from, ...who }, message: { message_id: 901, chat: { id: -100777, type: "supergroup" } } })
  const setNow = (h: number, m: number) => (now = clock(h, m))
  return { rows, published, recorded, previewsSent, edits, answers, at, press, pressInGroup, setNow, s }
}

describe("the approval rule (= bot_post_take)", () => {
  it("only the founder approves, publishes now or pauses; the timer publishes only an approved post", () => {
    assert.equal(takeAllowed("PENDING", "PUBLISHED", false), false)
    assert.equal(takeAllowed("APPROVED", "PUBLISHED", false), true)
    assert.equal(takeAllowed("PENDING", "APPROVED", true), true)
    assert.equal(takeAllowed("PENDING", "APPROVED", false), false)
    assert.equal(takeAllowed("PENDING", "PUBLISHED", true), true)
    assert.equal(takeAllowed("APPROVED", "PAUSED", true), true)
    assert.equal(takeAllowed("PENDING", "EXPIRED", false), true)
    for (const done of ["PUBLISHED", "PAUSED", "EXPIRED"] as const) for (const to of ["APPROVED", "PUBLISHED", "PAUSED", "EXPIRED"] as const) for (const f of [true, false]) assert.equal(takeAllowed(done, to, f), false)
  })
})

describe("preview-first — the preview at 06:15", () => {
  it("nothing before 06:15; one preview at 06:15 with the destination; it says it goes out on schedule unless ❌", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 14)
    assert.equal(f.previewsSent.length, 0)
    await f.at(6, 15)
    assert.equal(f.previewsSent.length, 1)
    assert.match(f.previewsSent[0].text, /^📢 គោលដៅផ្សាយ៖ \[ ✈️ Telegram Channel \+ 🔵 Facebook Page \]/)
    assert.match(f.previewsSent[0].text, /⏰ បើគ្មានការសម្រេចចិត្ត នឹងផ្សាយស្វ័យប្រវត្តិទៅ \[ .+ \] នៅម៉ោង ០៧:០០ ព្រឹក — ចុច «❌» ដើម្បីផ្អាក។$/)
    assert.equal(f.previewsSent[0].png, true) // the poster, never text-only
    await f.at(6, 16)
    await f.at(6, 59)
    assert.equal(f.previewsSent.length, 1)
    assert.equal(f.published.length, 0)
  })
})

describe("zero-pressure fallback — on schedule when nobody decided (founder, 20/10/2026; replaces the 18/10 strict hold)", () => {
  it("no tap: NOT before 07:00; auto-published at 07:00 exactly once; the card says so", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(6, 59)
    assert.deepEqual(f.published, [])
    await f.at(7, 0)
    await f.at(7, 1)
    await f.at(8, 0)
    assert.deepEqual(f.published, [1])
    assert.equal(f.rows[0].decided_how, "auto")
    assert.match(f.edits.at(-1)!.text, /✅ បានផ្សាយស្វ័យប្រវត្តិតាមកាលវិភាគ · ⏰ ម៉ោង ០៧:០០ ព្រឹក$/)
  })
  it("humour (the money dilemma) keeps the hard rule: never auto-published, expired unpublished", async () => {
    const f = fake(clock(18, 0))
    await f.s.schedulePost("DILEMMA", DAY, { day: DAY }, new Date(clock(18, 30)).toISOString())
    assert.doesNotMatch(f.previewsSent[0].text, /ស្វ័យប្រវត្តិ/)
    assert.match(f.previewsSent[0].text, /🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម/)
    await f.at(18, 30)
    await f.at(19, 0)
    assert.deepEqual(f.published, [])
    await f.at(20, 1)
    assert.equal(f.rows[0].status, "EXPIRED")
  })
  it("✅ at 06:30: held until 07:00, then published exactly once; ids recorded", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:a")
    assert.deepEqual(f.published, [])
    assert.match(f.edits.at(-1)!.text, /✅ បានយល់ព្រម — នឹងផ្សាយទៅ/)
    assert.equal(f.edits.at(-1)!.buttons, 2) // publish now / pause remain
    await f.at(6, 59)
    assert.deepEqual(f.published, [])
    await f.at(7, 0)
    await f.at(7, 1)
    assert.deepEqual(f.published, [1])
    assert.deepEqual(f.recorded, [{ id: 1, telegram: 61, facebook: "page_1" }])
  })
  it("✅ then ❌ before 07:00: never published", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:a")
    await f.press("sp:1:x")
    await f.at(7, 0)
    assert.deepEqual(f.published, [])
  })
  it("the server was down until 07:20: caught up on schedule once (within 90 minutes)", async () => {
    const f = fake(clock(7, 20))
    await f.at(7, 20)
    await f.at(7, 21)
    assert.deepEqual(f.published, [1])
  })
  it("a fuel change (an event, not a daily post): previewed now, not published at its time without approval; ✅ → published", async () => {
    const f = fake(clock(12, 0))
    const publishAt = new Date(clock(12, 45)).toISOString()
    await f.s.schedulePost("FUEL", "notice-42", { telegram: "⛽ …", facebook: "⛽ …" }, publishAt)
    assert.equal(f.previewsSent.length, 1)
    await f.at(12, 45)
    assert.deepEqual(f.published, [])
    await f.press("sp:1:a")
    await f.at(12, 46)
    assert.deepEqual(f.published, [1])
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
  it("🚀 pressed after it was published: no second post, told it is already out", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:a")
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
  it("someone else's chat cannot decide (approve or publish)", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:p", STRANGER)
    await f.press("sp:1:a", STRANGER)
    await f.at(6, 59)
    assert.deepEqual(f.published, []) // a stranger's 🚀 did nothing (at 07:00 the schedule takes over)
    assert.equal(f.rows[0].status, "PENDING")
    assert.deepEqual(f.answers.at(-1), { text: "សម្រាប់ Super Admin ប៉ុណ្ណោះ។", alert: true })
  })
})

describe("preview-first — a fresh preview for a re-armed post", () => {
  it("paused, then re-armed (PENDING again, no previews, a later time): one fresh preview; ✅ publishes it at its time", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:x")
    const row = f.rows[0]
    Object.assign(row, { status: "PENDING", previews: [], publish_at: new Date(clock(7, 40)).toISOString() })
    await f.at(7, 10)
    assert.equal(f.previewsSent.length, 2)
    await f.at(7, 11)
    assert.equal(f.previewsSent.length, 2)
    await f.press("sp:1:a")
    await f.at(7, 39)
    assert.deepEqual(f.published, [])
    await f.at(7, 40)
    await f.at(7, 41)
    assert.deepEqual(f.published, [1])
  })
  it("down until 08:30: nothing is posted hours late", async () => {
    const f = fake(clock(8, 30))
    await f.at(8, 30)
    assert.equal(f.rows.length, 0)
    assert.deepEqual(f.published, [])
  })
})

describe("Factual feeds publish on time; creative posts wait for the founder (founder, 19/10/2026)", () => {
  it("the market bulletin, the evening NBC rates and the 05:30 prayer times: created approved, no preview to the approval room, published at their time", async () => {
    for (const kind of ["BULLETIN", "RATES", "ISLAMIC_MORNING"] as const) {
      const f = fake(clock(10, 30))
      await f.s.schedulePost(kind, DAY, { day: DAY }, new Date(clock(10, 31)).toISOString())
      assert.equal(f.rows[0].status, "APPROVED", kind)
      assert.equal(f.previewsSent.length, 0, `${kind}: silent — nothing to the approval room`)
      await f.at(10, 31)
      assert.deepEqual(f.published, [1], kind)
      assert.equal(f.previewsSent.length, 0, kind)
    }
  })
  it("a post that needs the founder's decision is still previewed (the 07:00 poster)", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    assert.equal(f.previewsSent.length, 1)
  })
  it("a money dilemma (humour / discussion) stays held: never published without a tap", async () => {
    const f = fake(clock(17, 45))
    await f.s.schedulePost("DILEMMA", DAY, { day: DAY }, new Date(clock(18, 30)).toISOString())
    assert.equal(f.rows[0].status, "PENDING")
    await f.at(18, 30)
    await f.at(19, 0)
    assert.deepEqual(f.published, [])
  })
  it("in the approval group, only the founder's tap counts", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    await f.pressInGroup("sp:1:a", STRANGER)
    assert.equal(f.rows[0].status, "PENDING")
    assert.ok(f.answers.at(-1)!.alert) // «សម្រាប់ Super Admin ប៉ុណ្ណោះ។»
    await f.pressInGroup("sp:1:a", ADMIN)
    assert.equal(f.rows[0].status, "APPROVED")
  })
})

describe("The card names who decided and when (founder, 20/10/2026)", () => {
  const sok = { first_name: "Sok", username: "sok_lca" }
  it("✅ in «LCA Approval»: the approver's name, @username and time; then the timer's publish keeps the name", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    f.setNow(6, 32)
    await f.pressInGroup("sp:1:a", ADMIN, sok)
    const card = f.edits.at(-1)!.text
    assert.match(card, /✅ បានយល់ព្រមដោយ៖ 👤 Sok \(@sok_lca\)\n⏰ ម៉ោងអនុម័ត៖ ០៦:៣២ ព្រឹក\n📢 នឹងផ្សាយទៅ \[ .+ \] នៅម៉ោង ០៧:០០ ព្រឹក។$/)
    await f.at(7, 0)
    assert.deepEqual(f.published, [1])
    assert.match(f.edits.at(-1)!.text, /✅ បានផ្សាយរួចរាល់ នៅម៉ោង ០៧:០០ ព្រឹក\n👤 Sok \(@sok_lca\) បានយល់ព្រម · ⏰ ០៦:៣២ ព្រឹក$/)
  })
  it("🚀 and ❌: «បានបាញ់ផ្សាយភ្លាមៗដោយ» / «ត្រូវបានផ្អាកដោយ» with the time", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    await f.s.schedulePost("HOLIDAY", "h", {}, new Date(clock(18, 0)).toISOString())
    f.setNow(6, 40)
    await f.pressInGroup("sp:1:p", ADMIN, sok)
    assert.match(f.edits.at(-1)!.text, /🚀 បានបាញ់ផ្សាយភ្លាមៗដោយ៖ 👤 Sok \(@sok_lca\)\n⏰ ម៉ោងផ្សាយ៖ ០៦:៤០ ព្រឹក$/)
    await f.pressInGroup("sp:2:x", ADMIN, { first_name: "Sok" }) // no @username: the name alone
    assert.match(f.edits.at(-1)!.text, /❌ ត្រូវបានផ្អាកដោយ៖ 👤 Sok\n⏰ ម៉ោងផ្អាក៖ ០៦:៤០ ព្រឹក$/)
  })
  it("a stranger's tap names nobody; a post with no named decider keeps the plain status line", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    await f.pressInGroup("sp:1:a", STRANGER, { first_name: "Mallory" })
    assert.equal(f.rows[0].decided_name, undefined)
    await f.press("sp:1:x") // the founder's private chat: no Telegram profile in the callback
    assert.match(f.edits.at(-1)!.text, /❌ បានផ្អាកការផ្សាយថ្ងៃនេះ$/)
  })
})

describe("REPLACE OLD WITH NEW — today's published post, improved, replaces the old one (founder, 20/10/2026)", () => {
  function harness(version: { v: string }) {
    const row: PostRow = { id: 7, kind: "ISLAMIC_DAILY", post_key: DAY, payload: { day: DAY }, publish_at: atMinute(DAY, 480), status: "PUBLISHED", previews: [], telegram_message_id: 11, content_hash: "v1", replace_status: null }
    const log = { published: 0, deleted: [] as number[], previews: [] as string[], notes: [] as string[], asked: 0, edits: [] as string[], answers: [] as string[] }
    let failPublish = false
    const deps = {
      schedule: async () => null,
      autoTake: async () => null,
      take: async () => null,
      recordIds: async () => {},
      get: async () => ({ ...row }),
      due: async () => [],
      setPreviews: async () => {},
      adminChats: async () => [ADMIN],
      content: async () => ({ png: null, body: `lesson ${version.v}` }),
      targets: () => ({ telegram: true, facebook: false }),
      publish: async () => {
        if (failPublish) return { telegram: null, facebook: null }
        log.published++
        return { telegram: 12, facebook: null }
      },
      sendPreview: async (_c: number, _p: Buffer | null, text: string) => (log.previews.push(text), 950),
      editPreview: async (_p: Preview, text: string) => void log.edits.push(text),
      answer: async (_id: string, text: string) => void log.answers.push(text),
      now: () => clock(9, 0),
      log: () => {},
      replace: {
        publishedToday: async () => (row.status === "PUBLISHED" ? [{ ...row }] : []),
        contentHash: async () => version.v,
        setHash: async (_id: number, h: string) => void (row.content_hash = h),
        replaceAsk: async () => {
          if (row.replace_status === "PENDING" || row.replace_status === "APPROVED" || row.replace_status === "REPLACING") return false
          log.asked++
          row.replace_status = "PENDING"
          return true
        },
        replaceDecide: async (_id: number, replace: boolean, chat: number) => {
          if (chat !== ADMIN) throw new Error("super admin only")
          if (row.replace_status !== "PENDING") return "done"
          row.replace_status = replace ? "APPROVED" : "KEPT"
          return row.replace_status
        },
        replaceTake: async () => {
          if (row.replace_status !== "APPROVED") return []
          row.replace_status = "REPLACING"
          return [{ ...row }]
        },
        unpublish: async (r: PostRow) => (log.deleted.push(r.telegram_message_id!), true),
        replaceDone: async (_id: number, ok: boolean, ids: { telegram: number | null }, hash: string | null) => {
          if (!ok) return void (row.replace_status = "APPROVED")
          Object.assign(row, { replace_status: "DONE", telegram_message_id: ids.telegram, content_hash: hash })
        },
        notify: async (t: string) => void log.notes.push(t),
      },
    } satisfies SchedulerDeps
    const press = (data: string, from = ADMIN) => s.onCallback({ id: "cb", data, from: { id: from, first_name: "Sok" }, message: { message_id: 950, chat: { id: -100777, type: "supergroup" } } })
    const s = createScheduler(deps)
    return { row, log, s, press, failPublish: (v: boolean) => (failPublish = v) }
  }

  it("unchanged: nothing is asked", async () => {
    const h = harness({ v: "v1" })
    await h.s.checkVersions()
    assert.equal(h.log.asked, 0)
  })
  it("a new version: previewed once in the approval room with 🔄 / ❌; nothing goes out without a tap", async () => {
    const h = harness({ v: "v2" })
    await h.s.checkVersions()
    await h.s.checkVersions()
    assert.equal(h.log.asked, 1)
    assert.match(h.log.previews[0], /^🔄 កំណែថ្មីនៃការផ្សាយថ្ងៃនេះ/)
    await h.s.replaceDue()
    assert.equal(h.log.published, 0)
    await h.press("spr:7:y", STRANGER) // not an approver
    assert.equal(h.row.replace_status, "PENDING")
  })
  it("🔄: the new version is published first, then the old message deleted; the founder is told", async () => {
    const h = harness({ v: "v2" })
    await h.s.checkVersions()
    await h.press("spr:7:y")
    assert.equal(h.log.published, 1)
    assert.deepEqual(h.log.deleted, [11])
    assert.equal(h.row.telegram_message_id, 12)
    assert.equal(h.row.replace_status, "DONE")
    assert.match(h.log.edits[0], /^🔄 បានយល់ព្រមឱ្យជំនួសដោយ៖ 👤 Sok · ⏰ /)
    assert.match(h.log.notes[0], /^🔄 បានជំនួសរួចរាល់/)
    await h.s.replaceDue()
    assert.equal(h.log.published, 1) // once
  })
  it("the new version could not be sent: the old post stays (never deleted first), retried next pass", async () => {
    const h = harness({ v: "v2" })
    h.row.replace_status = "APPROVED"
    h.failPublish(true)
    await h.s.replaceDue()
    assert.deepEqual(h.log.deleted, [])
    assert.equal(h.row.replace_status, "APPROVED")
    h.failPublish(false)
    await h.s.replaceDue()
    assert.deepEqual(h.log.deleted, [11])
  })
  it("❌ keeps the old one and is not asked again for that version", async () => {
    const h = harness({ v: "v2" })
    await h.s.checkVersions()
    await h.press("spr:7:n")
    assert.equal(h.row.replace_status, "KEPT")
    assert.equal(h.row.content_hash, "v2")
    assert.equal(h.log.published, 0)
    await h.s.checkVersions()
    assert.equal(h.log.asked, 1)
  })
})
