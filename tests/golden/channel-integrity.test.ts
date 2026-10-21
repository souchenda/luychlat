// GOLDEN GUARD — channel publishing integrity (founder, 21/10/2026 — Task #441, after replaced morning posts reached the
// channels at night as new messages, one after another): an update edits the published message in place (silent), never
// a delete and a new post; a morning post is never published after 11:00, a bedtime one only 19:00–23:00; a public
// channel gets at most one broadcast in 30 minutes. Change only on the founder's decision.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { BEDTIME_KINDS, MORNING_KINDS, publishWindow, spacingWait } from "../../src/lib/publish-window"
import { atMinute } from "../../src/lib/scheduled-posts"
import { asEdit, editingMessage } from "../../src/lib/server/edit-in-place"
import { createScheduler, type PostRow, type SchedulerDeps } from "../../src/lib/server/scheduled-posts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const DAY = "2026-10-22"
const at = (h: number, m: number) => Date.parse(atMinute(DAY, h * 60 + m))
const ADMIN = 1

/** A scheduler over one post, with the clock, the channel's last broadcast and every publish recorded. */
function world(row: Partial<PostRow> & Pick<PostRow, "kind" | "publish_at" | "status">, o: { now: number; lastBroadcast?: number | null }) {
  const post: PostRow = { id: 1, post_key: DAY, payload: { day: DAY }, previews: [], ...row }
  let now = o.now
  const log = { published: 0, answers: [] as string[], deleted: 0 }
  const deps: SchedulerDeps = {
    schedule: async () => null,
    take: async (_id, status, chat) => {
      if (chat !== undefined && chat !== ADMIN) throw new Error("super admin only")
      if (post.status !== "PENDING" && post.status !== "APPROVED") return null
      post.status = status
      return { ...post }
    },
    recordIds: async () => {},
    get: async () => ({ ...post }),
    due: async () => ((post.status === "PENDING" || post.status === "APPROVED") && Date.parse(post.publish_at) <= now ? [{ ...post }] : []),
    setPreviews: async () => {},
    adminChats: async () => [ADMIN],
    content: async () => ({ png: null, body: "x" }),
    targets: () => ({ telegram: true, facebook: false }),
    publish: async () => (log.published++, { telegram: 99, facebook: null }),
    sendPreview: async () => 5,
    editPreview: async () => {},
    answer: async (_id, text) => void log.answers.push(text),
    now: () => now,
    log: () => {},
    channelOf: () => "community",
    lastBroadcast: async () => o.lastBroadcast ?? null,
    noteBroadcast: () => {},
  }
  const s = createScheduler(deps)
  const press = (data: string) => s.onCallback({ id: "cb", data, message: { message_id: 5, chat: { id: ADMIN, type: "private" } } })
  return { s, post, log, press, setNow: (t: number) => void (now = t) }
}

describe("GOLDEN · channel publishing integrity (Task #441)", () => {
  it("an update edits the published message — never deleteMessage + a new post", async () => {
    // In an update, a send to the channel becomes an edit of its message; one that can't be (a photo by URL, a video) is refused.
    const target = { chat: "@LuyChlatCommunity", messageId: 77, facebookPostId: null }
    await editingMessage(target, async () => {
      assert.deepEqual(asEdit("sendMessage", { chat_id: "@LuyChlatCommunity", text: "new", parse_mode: "HTML" }), { method: "editMessageText", payload: { chat_id: "@LuyChlatCommunity", message_id: 77, text: "new", parse_mode: "HTML" } })
      assert.equal(asEdit("sendPhoto", { chat_id: "@LuyChlatCommunity", photo: "x" }), null)
      assert.equal(asEdit("sendVideo", { chat_id: "@LuyChlatCommunity", video: "x" }), null)
      // Another chat (the founder's note) is untouched.
      assert.deepEqual(asEdit("sendMessage", { chat_id: 5, text: "note" }), { method: "sendMessage", payload: { chat_id: 5, text: "note" } })
      return null
    })
    assert.deepEqual(asEdit("sendMessage", { chat_id: "@LuyChlatCommunity", text: "a post" }), { method: "sendMessage", payload: { chat_id: "@LuyChlatCommunity", text: "a post" } }) // outside an update
    const sp = read("src/lib/server/scheduled-posts.ts")
    const replace = sp.slice(sp.indexOf("async function replaceDue()"), sp.indexOf("async function checkVersions()"))
    assert.match(replace, /r\.editInPlace\(row, \(\) => d\.publish\(row\)\)/)
    assert.doesNotMatch(replace, /deleteMessage|unpublish|deleteFacebookPost/)
    const real = sp.slice(sp.indexOf("async editInPlace(row, publish) {"), sp.indexOf("async replaceDone("))
    assert.match(real, /editingMessage\(\{ chat, messageId: row\.telegram_message_id/)
    assert.doesNotMatch(real, /deleteMessage|deleteFacebookPost/)
    assert.match(read("src/lib/server/telegram-bot.ts"), /const edit = asEdit\(method, payload\)\n {2}if \(!edit\) return \{ ok: false/)
    assert.match(read("src/lib/server/tip-bot.ts"), /const editing = editsChat\(chatId\) && !opts\.messageId\n {2}if \(editing\) opts = \{ \.\.\.opts, messageId: editTarget\(\)!\.messageId \}/)
    assert.match(read("src/lib/server/facebook-publisher.ts"), /const edit = editTarget\(\)\n {2}if \(edit\) \{\n {4}if \(!edit\.facebookPostId [^\n]+none made" \}/)
  })
  it("a morning post can never be published after 11:00 — not by the timer, not by ✅, not by 🚀", async () => {
    assert.deepEqual([...MORNING_KINDS], ["MORNING", "ISLAMIC_MORNING", "BULLETIN", "ISLAMIC_BULLETIN"])
    for (const kind of MORNING_KINDS) {
      assert.equal(publishWindow(kind, at(10, 59)).ok, true, kind)
      for (const [h, m] of [[11, 0], [11, 1], [15, 0], [20, 39], [23, 59]]) assert.equal(publishWindow(kind, at(h, m)).ok, false, `${kind} ${h}:${m}`)
    }
    // The timer: approved for 07:00, its turn comes at 11:05 → expired, never sent.
    const timer = world({ kind: "MORNING", publish_at: new Date(at(7, 0)).toISOString(), status: "APPROVED" }, { now: at(11, 5) })
    await timer.s.processDue()
    assert.deepEqual([timer.log.published, timer.post.status], [0, "EXPIRED"])
    // 🚀 at 20:39 (tonight's case): refused, the card stays, nothing sent.
    const tap = world({ kind: "MORNING", publish_at: new Date(at(7, 0)).toISOString(), status: "PENDING" }, { now: at(20, 39) })
    await tap.press("sp:1:p")
    assert.deepEqual([tap.log.published, tap.post.status], [0, "PENDING"])
    assert.match(tap.log.answers[0], /^⛔ ផុតម៉ោងហើយ — សារពេលព្រឹកផ្សាយបានត្រឹមម៉ោង ១១:០០ ព្រឹក ប៉ុណ្ណោះ។$/)
    // ✅ after its time is a publish — refused the same way.
    await tap.press("sp:1:a")
    assert.equal(tap.log.published, 0)
    // Before 11:00 it goes as always.
    const ok = world({ kind: "MORNING", publish_at: new Date(at(7, 0)).toISOString(), status: "PENDING" }, { now: at(9, 0) })
    await ok.press("sp:1:p")
    assert.equal(ok.log.published, 1)
  })
  it("a bedtime post only 19:00–23:00", async () => {
    assert.deepEqual([...BEDTIME_KINDS], ["EVENING", "ISLAMIC_NIGHT"])
    for (const kind of BEDTIME_KINDS) {
      assert.deepEqual([[18, 59], [19, 0], [22, 59], [23, 0], [2, 0]].map(([h, m]) => publishWindow(kind, at(h, m)).ok), [false, true, true, false, false], kind)
    }
    const late = world({ kind: "ISLAMIC_NIGHT", publish_at: new Date(at(21, 0)).toISOString(), status: "PENDING" }, { now: at(23, 15) })
    await late.press("sp:1:p")
    assert.equal(late.log.published, 0)
  })
  it("anti-flood: one broadcast per channel in 30 minutes — the next one waits its turn; the founder's 🚀 goes at once", async () => {
    assert.deepEqual([spacingWait(null, at(9, 0)), spacingWait(at(8, 40), at(9, 0)), spacingWait(at(8, 30), at(9, 0))], [0, 10, 0])
    const busy = world({ kind: "HOLYDAY", publish_at: new Date(at(7, 1)).toISOString(), status: "APPROVED" }, { now: at(7, 1), lastBroadcast: at(7, 0) })
    await busy.s.processDue()
    assert.deepEqual([busy.log.published, busy.post.status], [0, "APPROVED"]) // waits
    busy.setNow(at(7, 31))
    await busy.s.processDue()
    // (the fake's last broadcast stays at 07:00: 31 minutes later it goes)
    assert.deepEqual([busy.log.published, busy.post.status], [1, "PUBLISHED"])
    const urgent = world({ kind: "HOLYDAY", publish_at: new Date(at(7, 1)).toISOString(), status: "PENDING" }, { now: at(7, 5), lastBroadcast: at(7, 0) })
    await urgent.press("sp:1:p")
    assert.equal(urgent.log.published, 1)
  })
})
