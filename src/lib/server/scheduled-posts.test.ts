import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { atMinute, isAutoPublish, previewButtons, previewText, SAFETY_NET_KINDS, takeAllowed, type PostKind } from "../scheduled-posts"

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
    remind: {
      // As bot_post_remind_claim: a PENDING post whose time has come, each level once.
      async claim(id, level) {
        const row = rows.find((r) => r.id === id)
        if (!row || row.status !== "PENDING" || Date.parse(row.publish_at) > now || (row.reminders ?? 0) >= level) return false
        row.reminders = level
        return true
      },
      founderChats: async () => [ADMIN],
    },
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
  it("nothing before 06:15; one preview at 06:15 with the destination — no instruction lines (founder, 21/10/2026)", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 14)
    assert.equal(f.previewsSent.length, 0)
    await f.at(6, 15)
    assert.equal(f.previewsSent.length, 1)
    assert.match(f.previewsSent[0].text, /^📢 គោលដៅផ្សាយ៖ \[ ✈️ Telegram Channel \+ 🔵 Facebook Page \]/)
    assert.doesNotMatch(f.previewsSent[0].text, /🔒|មិនផ្សាយទេ ប្រសិនបើ/) // silence = HOLD is known; the ✅ names the time
    assert.doesNotMatch(f.previewsSent[0].text, /ស្វ័យប្រវត្តិ/)
    assert.equal(f.previewsSent[0].png, true) // the poster, never text-only
    await f.at(6, 16)
    await f.at(6, 59)
    assert.equal(f.previewsSent.length, 1)
    assert.equal(f.published.length, 0)
  })
})

describe("strict approval — nothing goes public without the founder (founder, 18/10/2026)", () => {
  it("no tap: NOT published at 07:00, nor at 08:00, nor in the afternoon — it waits; expired unpublished at midnight", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(7, 0)
    await f.at(7, 1)
    await f.at(8, 0)
    await f.at(8, 31)
    await f.at(15, 0)
    assert.deepEqual(f.published, [])
    assert.equal(f.rows[0].status, "PENDING")
    f.setNow(23, 59)
    await f.s.processDue()
    assert.equal(f.rows[0].status, "PENDING")
    f.setNow(24, 0)
    await f.s.processDue()
    assert.deepEqual(f.published, [])
    assert.equal(f.rows[0].status, "EXPIRED")
    assert.match(f.edits.at(-1)!.text, /⌛ មិនបានផ្សាយ — គ្មានការយល់ព្រមទាន់ពេល$/)
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
  it("the server was down until 07:20: the preview is still sent, nothing is published without a tap", async () => {
    const f = fake(clock(7, 20))
    await f.at(7, 20)
    assert.deepEqual(f.published, [])
    await f.at(7, 21)
    assert.deepEqual(f.published, [])
  })
  it("a fuel change: previewed now, not published at its time without approval; ✅ → published at its time", async () => {
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
    await f.at(7, 0)
    assert.deepEqual(f.published, [])
    assert.deepEqual(f.answers.at(-1), { text: "សម្រាប់ Super Admin ប៉ុណ្ណោះ។", alert: true })
  })
})

describe("preview-first — a fresh preview for a re-armed post", () => {
  it("paused, then re-armed (PENDING again, no previews, a later time): one fresh preview; published only once approved", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:x")
    const row = f.rows[0]
    Object.assign(row, { status: "PENDING", previews: [], publish_at: new Date(clock(7, 40)).toISOString() })
    await f.at(7, 10)
    assert.equal(f.previewsSent.length, 2)
    await f.at(7, 11)
    assert.equal(f.previewsSent.length, 2)
    await f.at(7, 40)
    assert.deepEqual(f.published, [])
    await f.press("sp:1:a")
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
  it("the market bulletin and the evening NBC rates: created approved, no preview to the approval room, published at their time", async () => {
    for (const kind of ["BULLETIN", "RATES"] as const) {
      const f = fake(clock(10, 30))
      await f.s.schedulePost(kind, DAY, { day: DAY }, new Date(clock(10, 31)).toISOString())
      assert.equal(f.rows[0].status, "APPROVED", kind)
      assert.equal(f.previewsSent.length, 0, `${kind}: silent — nothing to the approval room`)
      await f.at(10, 31)
      assert.deepEqual(f.published, [1], kind)
      assert.equal(f.previewsSent.length, 0, kind)
    }
  })
  it("the 05:30 prayer times (founder, 21/10/2026): still auto-published — and previewed the evening before as a safety net", async () => {
    assert.deepEqual(SAFETY_NET_KINDS, ["ISLAMIC_MORNING"])
    assert.ok(isAutoPublish("ISLAMIC_MORNING")) // stays on the whitelist: nobody wakes at 05:00 to tap
    const f = fake(clock(21, 30))
    await f.s.schedulePost("ISLAMIC_MORNING", DAY, { day: DAY }, new Date(clock(29, 30)).toISOString())
    assert.equal(f.rows[0].status, "APPROVED")
    assert.equal(f.previewsSent.length, 1, "one card to the approval room")
    assert.match(f.previewsSent[0].text, /🤖 ព័ត៌មានស្វ័យប្រវត្តិ — នឹងផ្សាយទៅ \[ [^\]]+ \] នៅ[^\n]+ដោយមិនចាំបាច់ចុច។$/) // no instruction line (founder, 21/10/2026): ❌ and ✏️ are the buttons
    // Silence = it publishes on time, once.
    await f.at(29, 30) // 05:30 the next morning
    assert.deepEqual(f.published, [1])
  })
  it("the safety net's card has ✏️ and ❌ only (no 🚀 at night) — and ❌ stops the 05:30 post", async () => {
    const targets = { telegram: true, facebook: false }
    assert.deepEqual(previewButtons(7, "APPROVED", targets, "ISLAMIC_MORNING"), [[{ text: "✏️ កែអត្ថបទ", callback_data: "sp:7:e" }], [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: "sp:7:x" }]])
    assert.equal(previewButtons(7, "APPROVED", targets, "MORNING").length, 2) // an approved poster keeps 🚀 | ✏️ and ❌
    assert.doesNotMatch(previewText({ kind: "MORNING", targets, publishAt: new Date(clock(7, 0)).toISOString(), body: "x", status: "APPROVED" }), /🤖/)
    const f = fake(clock(21, 30))
    await f.s.schedulePost("ISLAMIC_MORNING", DAY, { day: DAY }, new Date(clock(29, 30)).toISOString())
    await f.press("sp:1:x")
    assert.equal(f.rows[0].status, "PAUSED")
    await f.at(29, 30) // 05:30 the next morning
    assert.deepEqual(f.published, [])
  })
  it("regression: ✅ on a held post after its time only approved it — the timer then expired it 90 minutes late; now it publishes at once", async () => {
    const f = fake(clock(7, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(8, 0)).toISOString())
    await f.at(8, 0) // nobody tapped: held
    await f.at(10, 0)
    assert.deepEqual(f.published, [])
    f.setNow(10, 5)
    await f.press("sp:1:a") // ✅ two hours late
    assert.equal(f.rows[0].status, "PUBLISHED")
    assert.deepEqual(f.published, [1])
    await f.at(10, 6)
    assert.deepEqual(f.published, [1]) // once
    // Before its time ✅ still waits for the time.
    const g = fake(clock(7, 15))
    await g.s.schedulePost("MORNING", DAY, {}, new Date(clock(8, 0)).toISOString())
    await g.press("sp:1:a")
    assert.equal(g.rows[0].status, "APPROVED")
    assert.deepEqual(g.published, [])
  })
  it("the ✅ button says so once the time has passed: «✅ អនុម័ត និងផ្សាយឥឡូវនេះ»", () => {
    const targets = { telegram: true, facebook: false }
    const at = new Date(clock(8, 0)).toISOString()
    assert.equal(previewButtons(3, "PENDING", targets, "ISLAMIC_DAILY", { publishAt: at, now: new Date(clock(9, 0)).toISOString() })[0][0].text, "✅ អនុម័ត និងផ្សាយឥឡូវនេះ")
    assert.equal(previewButtons(3, "PENDING", targets, "ISLAMIC_DAILY", { publishAt: at, now: new Date(clock(7, 30)).toISOString() })[0][0].text, "✅ អនុម័ត (ផ្សាយម៉ោង ០៨:០០ ព្រឹក)")
  })
  it("a re-preview after the post's time still sends a fresh card until midnight (lesson 14 corrected after 08:00); a first schedule does not", async () => {
    const f = fake(clock(9, 0))
    await f.s.schedulePost("ISLAMIC_DAILY", DAY, { day: DAY }, new Date(clock(8, 0)).toISOString())
    assert.equal(f.previewsSent.length, 0) // the time has passed: no first preview (as before)
    await f.s.schedulePost("ISLAMIC_DAILY", DAY, { day: DAY }, new Date(clock(8, 0)).toISOString(), { late: true })
    assert.equal(f.previewsSent.length, 1) // the re-preview: a held post can be approved until midnight
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /await real\(\)\.schedulePost\(kind, key, payload, at, \{ late: true \}\)/)
    assert.match(sp, /const REPREVIEW_READY = \[[^\]]*"lesson14-hadith"/)
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270238000000_repreview_lesson14.sql"), "utf8"), /'repreview', 'lesson14-hadith'\)\n where kind = 'ISLAMIC_DAILY' and post_key = '2026-10-21' and status = 'PENDING'/)
  })
  it("regression guard: ✏️ edits, never decides — a tap leaves the post waiting (the old code paused anything not ✅ / 🚀)", async () => {
    const f = fake(clock(6, 15))
    await f.s.schedulePost("MORNING", DAY, {}, new Date(clock(7, 0)).toISOString())
    await f.press("sp:1:e")
    assert.equal(f.rows[0].status, "PENDING")
    assert.equal(f.answers.at(-1)!.text, "✏️ សូម Reply ជាមួយអត្ថបទថ្មី")
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.ok(sp.indexOf('if (parsed.action === "edit") {') < sp.indexOf("taken = await d.take(parsed.id"), "handled before any decision")
    // The prompt's reply edits the card it was asked under; the prompt is then removed.
    assert.match(sp, /const prompt = EDIT_PROMPTS\.get\(`\$\{chatId\}:\$\{replyTo\}`\)/)
    assert.match(sp, /reply_markup: \{ force_reply: true, selective: true, input_field_placeholder: "អត្ថបទថ្មី…" \}/)
  })
  it("live in-place refresh: after a deploy every waiting card is redrawn once with the current layout, the count logged", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /if \(!cardsRedrawn\) \{\n\s+cardsRedrawn = true\n\s+await refreshWaitingCards\(\)/)
    assert.match(sp, /for \(const row of \(data as PostRow\[\] \| null\) \?\? \[\]\) \{\n\s+await real\(\)\.refresh\(row\)/)
    assert.match(sp, /Waiting approval cards redrawn in place: \$\{n\}/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270240000000_posts_waiting_cards.sql"), "utf8")
    assert.match(sql, /where status in \('PENDING', 'APPROVED'\)\n\s+and jsonb_array_length\(coalesce\(previews, '\[\]'::jsonb\)\) > 0/)
  })
  it("regression: replacing the Islamic bulletin looked for the old copy in the community channel — the in-place edit routes as publish does", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    const unpublish = sp.slice(sp.indexOf("async editInPlace(row, publish) {"), sp.indexOf("async replaceDone("))
    assert.match(unpublish, /const islamic = channelFor\(row\.kind\) === "islamic" \|\| islamicNationalDay\(row\)/)
    assert.doesNotMatch(unpublish, /isIslamicKind/)
    assert.match(sp, /const islamic = channelFor\(row\.kind\) === "islamic" \|\| islamicNationalDay\(row\)\n\s+const chat = islamic \? islamicChannel\(approval\) : communityChannel\(approval\)\n\s+const buttons/) // publish
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
    const log = { published: 0, deleted: [] as number[], editedIn: [] as number[], previews: [] as string[], notes: [] as string[], asked: 0, edits: [] as string[], answers: [] as string[] }
    let failPublish = false
    const deps = {
      schedule: async () => null,
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
        // The update goes into the published message (Task #441): the post's publisher runs, nothing is deleted.
        editInPlace: async (r: PostRow, publish: () => Promise<{ telegram: number | null }>) => (log.editedIn.push(r.telegram_message_id!), (await publish()).telegram != null),
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
    assert.match(h.log.previews[0], /^✍️ ចំណុចកែប្រែ ៖ [^\n]+\n\n🔄 កំណែថ្មីនៃការផ្សាយថ្ងៃនេះ/) // what changed, first (Task #462)
    await h.s.replaceDue()
    assert.equal(h.log.published, 0)
    await h.press("spr:7:y", STRANGER) // not an approver
    assert.equal(h.row.replace_status, "PENDING")
  })
  it("🔄 (Task #441): the new version is edited INTO the published message — same message, nothing deleted, nothing new; the founder is told", async () => {
    const h = harness({ v: "v2" })
    await h.s.checkVersions()
    await h.press("spr:7:y")
    assert.equal(h.log.published, 1)
    assert.deepEqual(h.log.editedIn, [11])
    assert.deepEqual(h.log.deleted, [])
    assert.equal(h.row.telegram_message_id, 11) // the same message
    assert.equal(h.row.replace_status, "DONE")
    assert.equal(h.row.content_hash, "v2")
    assert.match(h.log.edits[0], /^🔄 បានយល់ព្រមឱ្យជំនួសដោយ៖ 👤 Sok · ⏰ /)
    assert.match(h.log.notes[0], /^🔄 បានកែរួចរាល់ .*\nសារដដែលក្នុងឆានែលត្រូវបានកែជាកំណែថ្មី — ស្ងាត់ៗ គ្មានសារថ្មីទេ។/)
    await h.s.replaceDue()
    assert.equal(h.log.published, 1) // once
  })
  it("the edit could not be made: the published version stays exactly as it was — never deleted, never re-posted, not retried every minute", async () => {
    const h = harness({ v: "v2" })
    h.row.replace_status = "APPROVED"
    h.failPublish(true)
    await h.s.replaceDue()
    assert.deepEqual(h.log.deleted, [])
    assert.equal(h.row.telegram_message_id, 11)
    assert.equal(h.row.replace_status, "DONE")
    assert.notEqual(h.row.content_hash, "v2")
    assert.match(h.log.notes[0], /^⚠️ មិនអាចកែសារបានទេ/)
    h.failPublish(false)
    await h.s.replaceDue()
    assert.equal(h.log.published, 0)
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

describe("still waiting at its time: never published — an URGENT reminder to the founder (founder, 20/10/2026)", () => {
  it("07:00 reminder 1, 08:00 reminder 2, each once, to the founder's private chat with ✅ publish now / ❌", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    assert.equal(f.previewsSent.length, 1) // the «LCA Approval» preview
    await f.at(7, 0)
    assert.equal(f.previewsSent.length, 2)
    assert.equal(f.previewsSent[1].chat, ADMIN)
    assert.equal(f.previewsSent[1].png, false)
    assert.match(f.previewsSent[1].text, /^🚨 ការក្រើនរំលឹកជាបន្ទាន់៖ ដល់ម៉ោងផ្សាយហើយ!\n• មាតិកា៖ ផុសព្រឹក \(Poster\) — ☀️ អរុណសួស្តី\n• ម៉ោងគ្រោងទុក៖ ០៧:០០ ព្រឹក\n• ស្ថានភាព៖ មិនទាន់មានការសម្រេចចិត្តពីអេដមីនឡើយ!/)
    await f.at(7, 1)
    await f.at(7, 59)
    assert.equal(f.previewsSent.length, 2)
    await f.at(8, 0)
    assert.equal(f.previewsSent.length, 3)
    assert.match(f.previewsSent[2].text, /^🚨 ការក្រើនរំលឹកលើកទី ២/)
    await f.at(9, 0)
    assert.equal(f.previewsSent.length, 3)
    assert.deepEqual(f.published, []) // never by the timer
    assert.equal(f.rows[0].previews.length, 3) // the group card and both reminders, updated together on a tap
  })
  it("the founder's ✅ on the reminder publishes at once and updates every card (the group's and his)", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(7, 0)
    f.setNow(7, 5)
    await f.press("sp:1:p")
    assert.deepEqual(f.published, [1])
    const touched = f.edits.filter((e) => /✅ បានផ្សាយរួចរាល់/.test(e.text)).map((e) => e.msg)
    assert.equal(touched.length, 2) // the «LCA Approval» card and the reminder
    assert.ok(f.edits.every((e) => e.buttons === 0))
  })
  it("❌ on the reminder pauses it: never published, no more reminders", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.at(7, 0)
    await f.press("sp:1:x")
    await f.at(8, 0)
    assert.deepEqual(f.published, [])
    assert.equal(f.previewsSent.length, 2)
  })
  it("an approved post gets no reminder — it is published at its time", async () => {
    const f = fake(clock(6, 0))
    await f.at(6, 15)
    await f.press("sp:1:a")
    await f.at(7, 0)
    assert.deepEqual(f.published, [1])
    assert.equal(f.previewsSent.length, 1)
  })
})

describe("regression: the 23/10 card never reached «LCA Approval» (founder, 22/10/2026 — Task #455)", () => {
  const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
  const tip = readFileSync(join(process.cwd(), "src/lib/server/tip-bot.ts"), "utf8")
  it("a poster that can't be attached: the card still goes, as text with a note — an approval is never left missing", () => {
    assert.match(sp, /const id = await sendPosterPhoto\(chat, png, text\.slice\(0, 1024\), \{ reply_markup \}\)\s*if \(id\) return id[\s\S]*?text = `⚠️ មិនអាចភ្ជាប់រូប Poster បានទេ/)
  })
  it("why a photo failed is always said (never a bare «no answer»), and the log never blames «no super admin chat» when chats exist", () => {
    assert.doesNotMatch(tip, /\?\? "no answer"/)
    assert.match(tip, /why = `\$\{err\.name \?\? "Error"\} /)
    assert.match(tip, /\(photo \$\{Math\.round\(png\.length \/ 1024\)\} KB, caption \$\{caption\.length\} chars\)/)
    assert.match(sp, /`Preview of \$\{row\.kind\} \$\{row\.post_key\}: not delivered to the \$\{chats\} approval chat\(s\) — tried again next minute`/)
  })
})

describe("one ✏️ prompt per card (founder, 22/10/2026 — Task #459: four identical prompts after quick taps)", () => {
  const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
  it("a repeat tap within 5 s does nothing; a later tap replaces the open prompt; none open → one is sent", async () => {
    const { promptStep, PROMPT_DEBOUNCE_MS } = await import("../scheduled-posts")
    assert.equal(PROMPT_DEBOUNCE_MS, 5000)
    const t = 1_000_000
    assert.equal(promptStep(undefined, t), "send")
    assert.equal(promptStep({ msg: 1020, at: t }, t + 400), "skip")
    assert.equal(promptStep({ msg: -1, at: t }, t + 100), "skip") // claimed while the first is being sent
    assert.equal(promptStep({ msg: 1020, at: t }, t + 6000), "replace")
  })
  it("wired: the tap is answered first; the prompt is claimed before the send; the old one deleted on replace, on the edit and on a decision", () => {
    assert.match(sp, /if \(parsed\.action === "edit"\) \{[\s\S]*?await d\.answer\(cb\.id, "✏️ សូម Reply ជាមួយអត្ថបទថ្មី"\)\s*if \(cb\.message\) await d\.promptEdit\?\.\(chat\.id, cb\.message\.message_id\)/)
    assert.match(sp, /if \(step === "skip"\) return\s*PROMPT_OF_CARD\.set\(key, \{ msg: -1, at: Date\.now\(\) \}\)[^\n]*\n\s*if \(step === "replace" && open && open\.msg > 0\) await dropPrompt\(chat, open\.msg\)/)
    assert.match(sp, /PROMPT_OF_CARD\.delete\(`\$\{chatId\}:\$\{replyTo\}`\)/) // the edit done: forgotten (the prompt is deleted just above)
    assert.match(sp, /for \(const p of taken\.previews \?\? \[\]\) await d\.promptDone\?\.\(p\.chat, p\.msg\)/)
  })
})
