import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { atMinute, dueAction, kmClock, parseScheduledPostCallback, plannedPosts, previewButtons, previewText, targetLabel } from "./scheduled-posts"

describe("scheduled posts — the preview window", () => {
  it("the 07:00 post: nothing at 06:14, its preview from 06:15, still scheduled until 08:29", () => {
    assert.equal(plannedPosts("2026-10-16", 6 * 60 + 14).length, 0)
    assert.deepEqual(plannedPosts("2026-10-16", 6 * 60 + 15), [{ kind: "MORNING", postKey: "2026-10-16", publishMinute: 420, payload: { day: "2026-10-16" } }])
    assert.equal(plannedPosts("2026-10-16", 8 * 60 + 29).length, 1)
    assert.equal(plannedPosts("2026-10-16", 8 * 60 + 30).length, 0)
  })
  it("holiday notes at 05:00, previewed the evening before from 21:30 (founder, 20/10/2026)", () => {
    // The eve's note (20 Nov 05:00) is previewed on the 19th from 21:30; the day back's (26 Nov) on the 25th.
    assert.ok(!plannedPosts("2026-11-19", 21 * 60 + 29).some((p) => p.kind === "HOLIDAY"))
    assert.deepEqual(plannedPosts("2026-11-19", 21 * 60 + 30).filter((p) => p.kind === "HOLIDAY").map((p) => [p.postKey, p.publishMinute]), [["2026-11-20-pre", 24 * 60 + 5 * 60]])
    assert.deepEqual(plannedPosts("2026-11-25", 22 * 60).filter((p) => p.kind === "HOLIDAY").map((p) => [p.postKey, p.publishMinute]), [["2026-11-26-post", 24 * 60 + 5 * 60]])
    assert.equal(atMinute("2026-11-19", 24 * 60 + 5 * 60), "2026-11-19T22:00:00.000Z") // 20 Nov 05:00 in Cambodia
    // Missed in the evening: caught up in the morning window (04:15–06:29), the same post key — never twice.
    assert.deepEqual(plannedPosts("2026-11-20", 4 * 60 + 15).map((p) => [p.kind, p.postKey, p.publishMinute]), [["HOLIDAY", "2026-11-20-pre", 300]])
    assert.ok(!plannedPosts("2026-11-26", 7 * 60 + 30).some((p) => p.kind === "HOLIDAY")) // the old 07:30 slot
  })
  it("the timer: publish ONLY an approved post; a pending one waits for the founder until the end of its day (20/10/2026)", () => {
    const at = atMinute("2026-10-16", 420)
    assert.equal(at, "2026-10-16T00:00:00.000Z")
    assert.equal(dueAction(at, Date.parse(at) - 1, "APPROVED"), "wait")
    assert.equal(dueAction(at, Date.parse(at), "APPROVED"), "publish")
    assert.equal(dueAction(at, Date.parse(at) + 91 * 60_000, "APPROVED"), "expire") // never posted hours late by the timer
    assert.equal(dueAction(at, Date.parse(at), "PENDING"), "hold")
    assert.equal(dueAction(at, Date.parse(at) + 91 * 60_000, "PENDING"), "hold")
    assert.equal(dueAction(at, Date.parse(atMinute("2026-10-16", 23 * 60 + 59)), "PENDING"), "hold")
    assert.equal(dueAction(at, Date.parse(atMinute("2026-10-17", 0)), "PENDING"), "expire") // midnight in Cambodia
  })
  it("the urgent reminders: at its time, then an hour later; the founder's card and buttons", async () => {
    const { reminderLevel, urgentReminderButtons, urgentReminderText } = await import("./scheduled-posts")
    const at = atMinute("2026-10-16", 420)
    assert.equal(reminderLevel(at, Date.parse(at) - 1), 0)
    assert.equal(reminderLevel(at, Date.parse(at)), 1)
    assert.equal(reminderLevel(at, Date.parse(at) + 59 * 60_000), 1)
    assert.equal(reminderLevel(at, Date.parse(at) + 60 * 60_000), 2)
    assert.equal(
      urgentReminderText({ kind: "ISLAMIC_DAILY", title: "📗 មេរៀន", publishAt: at, level: 1 }),
      [
        "🚨 ការក្រើនរំលឹកជាបន្ទាន់៖ ដល់ម៉ោងផ្សាយហើយ!",
        "• មាតិកា៖ ហ៊ីជរី និងមេរៀនហិរញ្ញវត្ថុហាឡាល់ — 📗 មេរៀន",
        "• ម៉ោងគ្រោងទុក៖ ០៧:០០ ព្រឹក",
        "• ស្ថានភាព៖ មិនទាន់មានការសម្រេចចិត្តពីអេដមីនឡើយ!",
        "",
        "មិនទាន់ផ្សាយទេ — នៅរង់ចាំការសម្រេចរបស់បង។ សូមបងពិនិត្យ និងចុចសម្រេចចិត្តខាងក្រោម៖",
      ].join("\n"),
    )
    assert.deepEqual(urgentReminderButtons(5), [[{ text: "✅ អនុម័ត និងផ្សាយឥឡូវនេះ", callback_data: "sp:5:p" }], [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: "sp:5:x" }]])
  })
})

describe("scheduled posts — the preview names its destination", () => {
  const at = atMinute("2026-10-16", 420)
  it("both, Telegram only, Facebook only", () => {
    assert.equal(targetLabel({ telegram: true, facebook: true }), "✈️ Telegram Channel + 🔵 Facebook Page")
    assert.equal(targetLabel({ telegram: true, facebook: false }), "✈️ Telegram Channel តែប៉ុណ្ណោះ")
    assert.equal(targetLabel({ telegram: false, facebook: true }), "🔵 Facebook Page តែប៉ុណ្ណោះ")
  })
  it("regression: instruction lines cluttered the iPhone card — a waiting card is the destination and the post, nothing else", () => {
    // Founder, 21/10/2026: no «🔒 មិនផ្សាយទេ …» — the team knows silence = HOLD; the ✅ names the time.
    const text = previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "☀️ …", status: "PENDING" })
    assert.equal(text, ["📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel + 🔵 Facebook Page ]", "👀 មើលជាមុន · ផុសព្រឹក (Poster)", "", "☀️ …"].join("\n"))
    assert.doesNotMatch(text, /🔒|មិនផ្សាយទេ ប្រសិនបើ|ចុច «/)
    const tgOnly = previewText({ kind: "HOLIDAY", targets: { telegram: true, facebook: false }, publishAt: atMinute("2026-11-20", 1080), body: "x", status: "PENDING" })
    assert.equal(tgOnly.split("\n")[0], "📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel តែប៉ុណ្ណោះ ]")
    // Approved keeps its one state line (when it goes out).
    assert.match(previewText({ kind: "HOLIDAY", targets: { telegram: true, facebook: false }, publishAt: atMinute("2026-11-20", 1080), body: "x", status: "APPROVED" }), /\n\n✅ បានយល់ព្រម — នឹងផ្សាយទៅ \[ ✈️ Telegram Channel តែប៉ុណ្ណោះ \] នៅម៉ោង ១៨:០០ ល្ងាច/)
    assert.equal(kmClock(atMinute("2026-10-16", 13 * 60 + 45)), "១៣:៤៥ រសៀល")
  })
  it("after a decision the notice becomes the outcome, and the buttons go", () => {
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PUBLISHED" }), /✅ បានផ្សាយរួចរាល់$/)
    assert.match(previewText({ kind: "MORNING", targets: { telegram: true, facebook: true }, publishAt: at, body: "x", status: "PAUSED" }), /❌ បានផ្អាកការផ្សាយថ្ងៃនេះ$/)
    assert.deepEqual(previewButtons(5, "PUBLISHED", { telegram: true, facebook: true }), [])
  })
  it("the thumb-friendly keyboard: ✅ full width with its time · 🚀 | ✏️ · ❌ full width (founder, 21/10/2026)", () => {
    const when = { publishAt: at, now: atMinute("2026-10-16", 375) } // 06:15, the 07:00 post
    assert.deepEqual(previewButtons(5, "PENDING", { telegram: true, facebook: true }, "MORNING", when), [
      [{ text: "✅ អនុម័ត (ផ្សាយម៉ោង ០៧:០០ ព្រឹក)", callback_data: "sp:5:a" }],
      [
        { text: "🚀 ផុសភ្លាមៗ", callback_data: "sp:5:p" },
        { text: "✏️ កែអត្ថបទ", callback_data: "sp:5:e" },
      ],
      [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: "sp:5:x" }],
    ])
    // Approved: the last two rows (no second approval).
    assert.deepEqual(previewButtons(5, "APPROVED", { telegram: true, facebook: true }, "MORNING").map((r) => r.map((b) => b.callback_data)), [["sp:5:p", "sp:5:e"], ["sp:5:x"]])
    // The factual feeds keep their source's words: no ✏️.
    for (const k of ["BULLETIN", "RATES", "ISLAMIC_BULLETIN", "FUEL", "POSTER"]) assert.deepEqual(previewButtons(5, "PENDING", { telegram: true, facebook: false }, k)[1], [{ text: "🚀 ផុសភ្លាមៗ", callback_data: "sp:5:p" }], k)
    // Never more than two buttons in a row — each one wide enough for a thumb.
    for (const row of previewButtons(5, "PENDING", { telegram: true, facebook: true }, "DILEMMA")) assert.ok(row.length <= 2)
    assert.deepEqual(parseScheduledPostCallback("sp:5:e"), { id: 5, action: "edit" })
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

describe("the 🔄 card says what changed (founder, 22/10/2026 — Task #462)", () => {
  it("«✍️ ចំណុចកែប្រែ ៖ …» at the very top: new figures, a new poster, a changed line — or that no earlier text was kept", async () => {
    const { changeSummary, replacePreviewText } = await import("./scheduled-posts")
    const before = { body: "<b>💱 អត្រា NBC</b>\n🇺🇸 1 USD = 4,072 ៛\n🥇 មាស $4,125", poster: "aaaa" }
    assert.equal(changeSummary(before, { body: "<b>💱 អត្រា NBC</b>\n🇺🇸 1 USD = 4,077 ៛\n🥇 មាស $4,125", poster: "aaaa" }), "✍️ ចំណុចកែប្រែ ៖ តួលេខ៖ 4,072 ៛ → 4,077 ៛")
    assert.equal(changeSummary(before, { body: before.body, poster: "bbbb" }), "✍️ ចំណុចកែប្រែ ៖ Poster ថ្មី")
    assert.match(changeSummary(before, { body: "<b>💱 អត្រា NBC</b>\n🇺🇸 1 USD = 4,072 ៛\n🥇 មាសសុទ្ធ $4,125", poster: "aaaa" }), /^✍️ ចំណុចកែប្រែ ៖ «🥇 មាស \$4,125» → «🥇 មាសសុទ្ធ \$4,125»$/)
    assert.equal(changeSummary({ body: null, poster: null }, { body: "x", poster: null }), "✍️ ចំណុចកែប្រែ ៖ ខ្លឹមសារត្រូវបានកែលម្អ (មិនមានកំណែចាស់ទុកសម្រាប់ប្រៀបធៀបទេ)")
    // Khmer digits and HTML tags are not «changes»; only the spacing moved → said so.
    assert.equal(changeSummary({ body: "<b>ក</b>\n១២", poster: null }, { body: "ក\n\n12", poster: null }), "✍️ ចំណុចកែប្រែ ៖ កែសម្រួលទម្រង់ និងចន្លោះបន្ទាត់")
    const card = replacePreviewText("BULLETIN", "body", "✍️ ចំណុចកែប្រែ ៖ Poster ថ្មី")
    assert.ok(card.startsWith("✍️ ចំណុចកែប្រែ ៖ Poster ថ្មី\n\n🔄 កំណែថ្មីនៃការផ្សាយថ្ងៃនេះ"))
  })
  it("wired: what went out is kept when published and when updated; the footer's links joined by « · », never «||»", async () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /if \(hash\) await d\.replace!\.setHash\(row\.id, hash, await d\.replace!\.snapshot\?\.\(row\)\)/)
    assert.match(sp, /const summary = changeSummary\(\{ body: row\.published_body \?\? null, poster: row\.published_poster \?\? null \}/)
    assert.match(sp, /replacePreviewText\(row\.kind, body, summary\)/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270252000000_post_snapshot.sql"), "utf8")
    assert.match(sql, /published_body = coalesce\(left\(p_body, 8000\), published_body\)/)
    assert.match(sql, /set content_hash = null\s+where status = 'PUBLISHED'/) // the footer change alone never floods «LCA Approval»
    const { appLinksLine } = await import("./post-footer")
    assert.doesNotMatch(appLinksLine("telegram") + appLinksLine("facebook"), /\|\|/)
    assert.match(appLinksLine("telegram"), /Android \(APK\)<\/a> · <a/)
  })
})
