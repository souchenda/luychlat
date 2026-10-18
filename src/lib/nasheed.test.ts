import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { audioSrc, parseNasheedCallback, rankTracks, reviewButtons, reviewCaption, SUBMIT_MAX_BYTES, submissionError, submissionExt } from "./nasheed"

const ID = "0b9f3c3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f"
const ok = { title: "សូឡាវ៉ាត់", artist: "ក្រុមកសាដះ", file: { name: "a.mp3", size: 3_000_000, type: "audio/mpeg" }, authentic: true, rights: true }
const sql = () => readFileSync(join(process.cwd(), "supabase/migrations/20270172000000_nasheed_community.sql"), "utf8")

describe("Community qasidah — what a member may send", () => {
  it("title, artist, an MP3 / M4A of at most 20 MB and both confirmations", () => {
    assert.equal(submissionError(ok), null)
    assert.equal(submissionError({ ...ok, title: " " }), "nasheed.required")
    assert.equal(submissionError({ ...ok, file: null }), "nasheed.fileRequired")
    assert.equal(submissionError({ ...ok, file: { ...ok.file, size: SUBMIT_MAX_BYTES + 1 } }), "nasheed.tooBig")
    assert.equal(submissionError({ ...ok, file: { name: "a.wav", size: 10, type: "audio/wav" } }), "nasheed.notAudio")
    assert.equal(submissionError({ ...ok, authentic: false }), "nasheed.confirmRequired")
    assert.equal(submissionError({ ...ok, rights: false }), "nasheed.confirmRequired")
  })
  it("the extension comes from the type, or the name when the phone gives none", () => {
    assert.equal(submissionExt({ name: "x.bin", type: "audio/x-m4a" }), "m4a")
    assert.equal(submissionExt({ name: "x.MP3", type: "" }), "mp3")
    assert.equal(submissionExt({ name: "x.exe", type: "" }), null)
    assert.equal(submissionExt({ name: "x.mp3", type: "video/mp4" }), null)
  })
})

describe("Community qasidah — never public before the founder's ✅", () => {
  it("a submission still in the private bucket has no playable address", () => {
    const pub = (p: string) => `https://cdn.example/${p}`
    assert.equal(audioSrc(`sub:u/${ID}.mp3`, pub), null)
    assert.equal(audioSrc(null, pub), null)
    assert.equal(audioSrc("/audio/nasheed/robbana-sholli-el-mafaz.mp3", pub), "/audio/nasheed/robbana-sholli-el-mafaz.mp3")
    assert.equal(audioSrc(`community/${ID}.mp3`, pub), `https://cdn.example/community/${ID}.mp3`)
  })
  it("the database: PENDING by default, a private 20 MB bucket in the member's own folder, read only by the approved / own / super admin", () => {
    const s = sql()
    assert.match(s, /'nasheed-submissions', 'nasheed-submissions', false, 20971520/)
    assert.match(s, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
    assert.match(s, /using \(\(active and status = 'APPROVED'\) or submitted_by = auth\.uid\(\) or public\.is_super_admin\(\)\)/)
    assert.match(s, /'PENDING', me, me, 100/)
    assert.match(s, /if not coalesce\(p_authentic, false\) or not coalesce\(p_rights, false\) then raise exception 'confirmations required'/)
  })
  it("only a super admin's chat can approve or reject, and only once", () => {
    const s = sql()
    assert.match(s, /actor := public\.tip_chat_super_admin\(p_chat_id\);\s+if actor is null then raise exception 'super admin only'/)
    assert.match(s, /where t\.id = p_id and t\.status = 'PENDING'/)
  })
  it("the founder's buttons", () => {
    assert.deepEqual(reviewButtons(ID)[0].map((b) => b.callback_data), [`ns:${ID}:a`, `ns:${ID}:r`])
    assert.deepEqual(parseNasheedCallback(`ns:${ID}:a`), { id: ID, approve: true })
    assert.deepEqual(parseNasheedCallback(`ns:${ID}:r`), { id: ID, approve: false })
    assert.equal(parseNasheedCallback(`ns:${ID}:x`), null)
    assert.equal(parseNasheedCallback("ns:1:a"), null)
  })
  it("the caption names the track, the artist and who shared it — escaped", () => {
    const c = reviewCaption({ title: "<b>x</b>", artist: "A & B", submitter: "Sok", state: "PENDING" })
    assert.match(c, /&lt;b&gt;x&lt;\/b&gt;/)
    assert.match(c, /A &amp; B/)
    assert.match(c, /👤 អ្នកចែករំលែក៖ Sok/)
    assert.doesNotMatch(c, /<i>/)
  })
})

describe("❤️ Likes — the favourites rise", () => {
  it("most liked first, then the curated order, then the oldest", () => {
    const r = rankTracks([
      { id: "a", likes: 0, sort: 10, created_at: "1" },
      { id: "b", likes: 5, sort: 40, created_at: "2" },
      { id: "c", likes: 5, sort: 20, created_at: "3" },
      { id: "d", likes: 0, sort: 10, created_at: "0" },
    ])
    assert.deepEqual(r.map((x) => x.id), ["c", "b", "d", "a"])
  })
  it("one like per person per track, only on approved tracks, counted by a trigger", () => {
    const s = sql()
    assert.match(s, /primary key \(track_id, user_id\)/)
    assert.match(s, /with check \(user_id = auth\.uid\(\) and exists \(select 1 from public\.nasheed_tracks t where t\.id = track_id and t\.status = 'APPROVED'/)
    assert.match(s, /set likes = greatest\(likes - 1, 0\)/)
  })
})

describe("The three Commons recordings ship with the app, credited", () => {
  it("every seeded file exists and carries its licence", () => {
    const s = sql()
    for (const [file, licence] of [
      ["alhamdulillah-jawad-syed.mp3", "CC BY 3.0"],
      ["robbana-sholli-el-mafaz.mp3", "CC BY-SA 4.0"],
      ["praise-before-dawn-yemen.mp3", "CC BY-SA 4.0"],
    ]) {
      const path = join(process.cwd(), "public/audio/nasheed", file)
      assert.ok(existsSync(path) && statSync(path).size > 500_000, file)
      assert.match(s, new RegExp(`'/audio/nasheed/${file.replace(/\./g, "\\.")}',[\\s\\S]{0,300}Wikimedia Commons · ${licence.replace(/\./g, "\\.")}'`))
    }
  })
})
