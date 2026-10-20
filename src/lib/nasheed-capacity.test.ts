import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { demotedNotice, demotedReport, NASHEED_GRACE_DAYS, NASHEED_PUBLIC_CAP, PLAY_COUNT_SECONDS, playsChip, reviewButtons, reviewCaption, submittedThanksNasheed } from "./nasheed"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sql = () => read("supabase/migrations/20270206000000_nasheed_capacity_plays.sql")

describe("The community qasidah library: 30 tracks, plays, a polite move to «បទផ្ទាល់ខ្លួន» (founder, 20/10/2026)", () => {
  it("the numbers: 30 public, 7 days' grace, a play past 15 seconds; «🎧 ១២ ដង»", () => {
    assert.equal(NASHEED_PUBLIC_CAP, 30)
    assert.equal(NASHEED_GRACE_DAYS, 7)
    assert.equal(PLAY_COUNT_SECONDS, 15)
    assert.equal(playsChip(12), "🎧 ១២ ដង")
  })
  it("plays: counted once per listen past 15 s in the player; the database counts a listener at most every 30 minutes, approved tracks only", () => {
    const player = read("src/components/islamic/audio-player.tsx")
    assert.match(player, /kind === "nasheed" && key\?\.startsWith\("nasheed:"\) && counted !== key && a\.currentTime >= PLAY_COUNT_SECONDS/)
    assert.match(player, /useAudioPlayer\.setState\(\{ index, position: 0, duration: 0, loading: true \}\)\n\s+counted = null/)
    const s = sql()
    assert.match(s, /where t\.id = p_id and t\.kind = 'STREAM' and t\.status = 'APPROVED' and t\.active/)
    assert.match(s, /where public\.nasheed_plays\.last_at < now\(\) - interval '30 minutes'/)
  })
  it("over 30: the fewest plays, then the oldest approval — a member's track past its first 7 days; the app's own are never moved", () => {
    const s = sql()
    assert.match(s, /if total <= p_cap then return/)
    assert.match(s, /and t\.submitted_by is not null\s+and t\.reviewed_at < now\(\) - interval '7 days' and t\.audio_path like 'community\/%'\s+order by t\.play_count asc, t\.reviewed_at asc/)
  })
  it("moved, never deleted: copied into the submitter's own folder first, then PRIVATE with demoted_at, then the public copy removed", () => {
    const s = sql()
    assert.match(s, /set status = 'PRIVATE', active = false, audio_path = 'own:' \|\| p_own_path, demoted_at = now\(\)/)
    assert.match(s, /split_part\(p_own_path, '\/', 1\) = t\.submitted_by::text/)
    const server = read("src/lib/server/nasheed-review.ts")
    const copy = server.indexOf("storage.from(SUBMISSIONS_BUCKET).upload(ownPath")
    const demote = server.indexOf('rpc("bot_nasheed_demote"')
    const removePublic = server.indexOf("storage.from(PUBLIC_BUCKET).remove([t.audio_path])")
    assert.ok(copy > 0 && copy < demote && demote < removePublic, "copy → demote → remove the public copy")
    assert.match(server, /if \(parsed\.approve\) await enforceNasheedCapacity\(\)/)
  })
  it("the submitter's note: «អាស្សាឡាមុអាឡៃកុម», Jazakallahu Khayran, still in «បទផ្ទាល់ខ្លួន»; no italics; the founder's line", () => {
    const n = demotedNotice("Hulum Takhrij")
    assert.match(n.html, /^🕌 <b>សារពី អេប លុយឆ្លាត \(សហគមន៍ឥស្លាម\)<\/b>\n\n« <b>អាស្សាឡាមុអាឡៃកុម បងប្អូន!<\/b>\nបទ <b>Hulum Takhrij<\/b> ដែលបងប្អូនបានចូលរួមចែករំលែក/)
    assert.match(n.html, /\(Jazakallahu Khayran\) សម្រាប់ការចូលរួមចំណែកដ៏មានតម្លៃរបស់បងប្អូន! សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ និងបារ៉ាកាត់ដល់បងប្អូន និងក្រុមគ្រួសារ! 🤲✨ »/)
    assert.match(n.html, /បញ្ជាក់៖ បទនេះនៅតែរក្សាទុកក្នុងផ្ទាំង «បទផ្ទាល់ខ្លួន» \(My Tracks\) របស់បងប្អូនដដែល។$/)
    assert.doesNotMatch(n.html, /<i>|ជំរាបសួរ/)
    assert.equal(demotedReport("A", 3), "ℹ️ <b>បង្វិលបទចម្រៀង៖</b> បទ «A» (អ្នកស្តាប់៖ 3 ដង) ត្រូវបានប្តូរទៅកាន់បទផ្ទាល់ខ្លួនរបស់អ្នក Upload ដើម្បីបើកផ្លូវឱ្យបទថ្មី។")
    assert.match(read("src/lib/server/nasheed-review.ts"), /for \(const chat of await founderChats\(\)\) if \(\(await tg\("sendMessage", \{ chat_id: chat, text: demotedReport/) // the founder's chat, never the group
  })
  it("a public submission: thanked at once (the app's dialog and the submitter's Telegram); the review card with name and contact", () => {
    // One to one: by name (founder, 20/10/2026); «បងប្អូន» only without a name.
    const thanks = submittedThanksNasheed("Hulum Takhrij", false, "Yerny")
    assert.match(thanks, /^🕌 សារពី អេប លុយឆ្លាត \(សហគមន៍ឥស្លាម\)\n\n« អាស្សាឡាមុអាឡៃកុម Yerny!\n\nអេប លុយឆ្លាត សូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះការចូលរួមចែករំលែកបទ «Hulum Takhrij»។/)
    assert.match(thanks, /ប្រទានពរជ័យ សេចក្តីសុខ និងបារ៉ាកាត់ដល់ Yerny និងក្រុមគ្រួសារ! 🤲✨ »$/)
    assert.match(submittedThanksNasheed("x", false, null), /« អាស្សាឡាមុអាឡៃកុម បងប្អូន!/)
    assert.match(demotedNotice("x", "Yerny").plain, /« អាស្សាឡាមុអាឡៃកុម Yerny!/)
    assert.match(read("src/lib/server/nasheed-review.ts"), /submittedThanksNasheed\(title, true, contact\.name\)/)
    assert.match(read("src/app/(app)/islamic/nasheed/page.tsx"), /submittedThanksNasheed\(thanked, false, myName\)/)
    assert.match(read("src/app/(app)/islamic/nasheed/page.tsx"), /data-testid="nasheed-thanks"/)
    assert.match(read("src/lib/server/nasheed-review.ts"), /await thankSubmitterNow\(row\.title_km, who\)/)
    const card = reviewCaption({ title: "Hulum Takhrij", artist: "Ahmed", submitter: "Yerny", contact: "+85512345678", state: "PENDING" })
    assert.equal(
      card,
      ["🎵 <b>សំណើចែករំលែកបទកសាដះ/ណាស្សីដថ្មី</b>", "• <b>ចំណងជើងបទ៖</b> Hulum Takhrij", "• <b>អ្នកសូត្រ/ច្រៀង៖</b> Ahmed", "• <b>អ្នកចែករំលែក៖</b> 👤 Yerny (+85512345678)", "", "សូមស្តាប់សាកល្បង និងចុចសម្រេចចិត្ត៖"].join("\n"),
    )
    assert.deepEqual(reviewButtons("x")[0].map((b) => b.text), ["✅ អនុម័តចូលបណ្ណាល័យរួម", "❌ បដិសេធ"])
    const done = reviewCaption({ title: "T", artist: "A", submitter: "Y", state: "APPROVED", decidedBy: "Sok", decidedAt: "១០:៣០ ព្រឹក" })
    assert.match(done, /^✅ <b>បានអនុម័តចូលបណ្ណាល័យរួម<\/b>\n👤 ដោយ៖ Sok · ⏰ ១០:៣០ ព្រឹក\n/)
  })
})
