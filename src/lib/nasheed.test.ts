import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { audioSrc, parseNasheedCallback, rankTracks, reviewButtons, reviewCaption, SUBMIT_MAX_BYTES, submissionError, submissionExt, submissionPath } from "./nasheed"

const ID = "0b9f3c3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f"
const ok = { title: "សូឡាវ៉ាត់", artist: "ក្រុមកសាដះ", file: { name: "a.mp3", size: 3_000_000, type: "audio/mpeg" }, authentic: true }
const sql = () => readFileSync(join(process.cwd(), "supabase/migrations/20270172000000_nasheed_community.sql"), "utf8")

describe("Community qasidah — what a member may send", () => {
  it("title, artist, an MP3 / M4A of at most 20 MB and both confirmations", () => {
    assert.equal(submissionError(ok), null)
    assert.equal(submissionError({ ...ok, title: " " }), "nasheed.titleRequired")
    assert.equal(submissionError({ ...ok, artist: "" }), "nasheed.artistRequired")
    assert.equal(submissionError({ ...ok, file: null }), "nasheed.fileRequired")
    assert.equal(submissionError({ ...ok, file: { ...ok.file, size: SUBMIT_MAX_BYTES + 1 } }), "nasheed.tooBig")
    assert.equal(submissionError({ ...ok, file: { name: "a.wav", size: 10, type: "audio/wav" } }), "nasheed.notAudio")
    assert.equal(submissionError({ ...ok, authentic: false }), "nasheed.confirmRequired")
    assert.equal(submissionError({ title: "x", artist: "y", file: ok.file, authentic: true }), null) // the one confirmation is enough (20/10/2026)
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
    // One confirmation since 20/10/2026 (authentic Islamic content; non-commercial sharing under notice & take-down).
    const now = readFileSync(join(process.cwd(), "supabase/migrations/20270204000000_nasheed_single_confirmation.sql"), "utf8")
    assert.match(now, /if not coalesce\(p_authentic, false\) then raise exception 'confirmation required'/)
    assert.doesNotMatch(now, /coalesce\(p_rights/)
    assert.match(now, /p_path !~ '\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\\.\(mp3\|m4a\|aac\)\$'/)
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
    assert.match(c, /• <b>អ្នកចែករំលែក៖<\/b> 👤 Sok$/m)
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

describe("Qasidah upload — a file named in Arabic (founder, 19/10/2026: such an upload failed)", () => {
  const arabic = "مولاي_حلم_التخرج_تحقق_128k.mp3"
  it("is recognised by its extension when the phone gives a generic or odd audio type", () => {
    for (const type of ["", "application/octet-stream", "audio/x-mpeg", "audio/mpeg3", "AUDIO/MPEG"]) assert.equal(submissionExt({ name: arabic, type }), "mp3", type)
    assert.equal(submissionExt({ name: "تلاوة.m4a", type: "video/mp4" }), "m4a") // the same container
    assert.equal(submissionExt({ name: arabic, type: "image/jpeg" }), null)
    assert.equal(submissionExt({ name: "صورة.jpg", type: "" }), null)
  })
  it("passes validation with every field filled", () => {
    assert.equal(submissionError({ title: "អាល់ហាំឌូលិលឡាហ៍", artist: "ក្រុម El Mafaz", file: { name: arabic, size: 4_800_000, type: "application/octet-stream" }, authentic: true }), null)
  })
  it("is stored under a random UUID in the member's folder — never its own name — the path the database accepts", () => {
    const user = "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b"
    const path = submissionPath(user, "mp3")
    assert.match(path, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp3|m4a|aac)$/) // nasheed_submit's own check
    assert.ok(path.startsWith(`${user}/`) && !/[؀-ۿ]/.test(path))
    assert.notEqual(submissionPath(user, "mp3"), path)
  })
  it("the share form is always in Khmer, with the founder's words", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/nasheed/page.tsx"), "utf8")
    assert.match(page, /function ShareSheet[\s\S]*?const t = useKhmerT\(\)/)
    const { dictionaries } = await import("./i18n/dictionaries")
    assert.equal(dictionaries.km["nasheed.send"], "ផ្ញើសុំការអនុម័ត")
    assert.equal(dictionaries.km["nasheed.titleRequired"], "សូមបញ្ចូលចំណងជើងបទកសាដះ")
    assert.equal(dictionaries.km["nasheed.artistRequired"], "សូមបញ្ចូលឈ្មោះអ្នកច្រៀង ឬក្រុមចម្រៀង")
    assert.equal(dictionaries.km["nasheed.fileRequired"], "សូមជ្រើសរើសឯកសារសំឡេង MP3 ឬ M4A")
    assert.equal(dictionaries.km["nasheed.confirmRequired"], "សូមធីកបញ្ជាក់ថា នេះជាបទកសាដះ ឬណាស្សីដឥស្លាមពិតប្រាកដ")
    assert.equal(dictionaries.km["nasheed.tooMany"], "អ្នកមានបទចំនួន ៣ កំពុងរង់ចាំការអនុម័តរួចហើយ")
  })
})

describe("Yerny's «Hulum Takhrij» upload (founder, 20/10/2026)", () => {
  const arabic = { name: "حلم_التخرج_تحقق_designer_128k.mp3", size: 4_200_000, type: "audio/mpeg" }
  it("an Arabic filename never reaches the storage key: <user>/<uuid>.mp3, which the database accepts", () => {
    assert.equal(submissionExt(arabic), "mp3")
    assert.equal(submissionExt({ ...arabic, type: "" }), "mp3") // a phone that gives no type: by its name
    const path = submissionPath(ID, "mp3")
    assert.match(path, new RegExp(`^${ID}/[0-9a-f-]{36}\.mp3$`))
    assert.doesNotMatch(path, /[^\x20-\x7e]/) // ASCII only
    assert.match(sql(), /p_path !~ '\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\\.\(mp3\|m4a\|aac\)\$'/)
  })
  it("one confirmation only — no «I recorded it / have permission» box; unticked: red under it, not only a toast", async () => {
    const { dictionaries } = await import("./i18n/dictionaries")
    assert.equal(submissionError({ ...ok, file: arabic }), null) // Yerny's file, with the one confirmation
    assert.equal(submissionError({ ...ok, file: arabic, authentic: false }), "nasheed.confirmRequired")
    assert.equal(dictionaries.km["nasheed.confirmAuthentic"], "ខ្ញុំបញ្ជាក់ថា នេះជាបទកសាដះ ឬណាស្សីដឥស្លាមពិតប្រាកដ (គ្មានខ្លឹមសារខុសឆ្គង)")
    assert.ok(!("nasheed.confirmRights" in dictionaries.km))
    assert.equal(dictionaries.km["nasheed.disclaimer"], "ℹ️ សំឡេងសាធារណៈចែករំលែកដើម្បីស្តាប់ក្នុងសហគមន៍ដោយមិនរកប្រាក់ចំណេញ។ ប្រព័ន្ធនឹងលុបចេញវិញភ្លាមៗ ប្រសិនបើមានការស្នើសុំពីម្ចាស់កម្មសិទ្ធិដើម។")
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/nasheed/page.tsx"), "utf8")
    assert.doesNotMatch(page, /s-rights|confirmRights/)
    assert.match(page, /const missingConfirm = tried && isPublic && !authentic/)
    assert.match(page, /role="alert" className="text-sm font-medium text-destructive" data-testid="nasheed-confirm-error"/)
    assert.match(page, /data-testid="nasheed-disclaimer"/)
    assert.doesNotMatch(readFileSync(join(process.cwd(), "src/lib/nasheed-data.ts"), "utf8"), /rights: v\.rights/)
  })
  it("any signed-in member (a content admin too) may upload into their own folder; nobody else's", () => {
    const s = sql()
    assert.match(s, /with check \(bucket_id = 'nasheed-submissions' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text\)/)
  })
})

describe("🌐 public or 🔒 private, and the two tabs (founder, 20/10/2026)", () => {
  const priv = () => readFileSync(join(process.cwd(), "supabase/migrations/20270205000000_nasheed_private_tracks.sql"), "utf8")
  it("a private track needs no confirmation; it is never streamed from the public bucket, only its own signed URL", async () => {
    const { ownPath, privateError } = await import("./nasheed")
    assert.equal(privateError({ title: "Hulum Takhrij", artist: "x", file: { name: "حلم_التخرج.mp3", size: 4_200_000, type: "audio/mpeg" } }), null)
    assert.equal(privateError({ title: "", artist: "x", file: ok.file }), "nasheed.titleRequired")
    const path = `${ID}/${ID}.mp3`
    assert.equal(audioSrc(`own:${path}`, () => "PUBLIC"), null)
    assert.equal(ownPath(`own:${path}`), path)
    assert.equal(ownPath(`sub:${path}`), null)
    assert.equal(ownPath("own:../other/file.mp3"), null)
  })
  it("the database: PRIVATE status, the member's own folder, at most 50, deleted only by its owner; never listed for others", () => {
    const s = priv()
    assert.match(s, /check \(status in \('PENDING', 'APPROVED', 'REJECTED', 'PRIVATE'\)\)/)
    assert.match(s, /using \(\(active and status = 'APPROVED'\) or submitted_by = auth\.uid\(\) or \(public\.is_content_manager\(\) and status <> 'PRIVATE'\)\)/)
    assert.match(s, /split_part\(p_path, '\/', 1\) <> me::text or p_path !~ '\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\\.\(mp3\|m4a\|aac\)\$'/)
    assert.match(s, /t\.status = 'PRIVATE'\) >= 50 then/)
    assert.match(s, /'own:' \|\| p_path, 'Private: the member''s own listening only — never shown to others',\s+'PRIVATE', false, me, me, 100\)/)
    assert.match(s, /delete from public\.nasheed_tracks t where t\.id = p_id and t\.submitted_by = auth\.uid\(\) and t\.status = 'PRIVATE'/)
  })
  it("the page: Community and My Tracks tabs; the sheet: 🌐 (✅ checkbox, «ផ្ញើសុំការអនុម័ត») or 🔒 (no checkbox, «រក្សាទុកស្តាប់ផ្ទាល់ខ្លួន»)", async () => {
    const { dictionaries } = await import("./i18n/dictionaries")
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/nasheed/page.tsx"), "utf8")
    assert.match(page, /\{ value: "community", label: t\("nasheed\.tabCommunity"\) \},\s+\{ value: "mine", label: t\("nasheed\.tabMine"\) \}/)
    assert.match(page, /useState<NasheedVisibility>\("public"\)/) // public by default
    assert.match(page, /\{isPublic && \(\s+<>\s+\{check\("s-authentic"/)
    assert.match(page, /t\(isPublic \? "nasheed\.send" : "nasheed\.savePrivate"\)/)
    assert.equal(dictionaries.km["nasheed.tabCommunity"], "🌐 បណ្ណាល័យរួម (Community)")
    assert.equal(dictionaries.km["nasheed.tabMine"], "👤 បទផ្ទាល់ខ្លួន (My Tracks)")
    assert.equal(dictionaries.km["nasheed.visPublic"], "🌐 ចែករំលែកជាសាធារណៈ")
    assert.equal(dictionaries.km["nasheed.visPrivate"], "🔒 ទុកស្តាប់ផ្ទាល់ខ្លួន")
    assert.equal(dictionaries.km["nasheed.savePrivate"], "រក្សាទុកស្តាប់ផ្ទាល់ខ្លួន")
    assert.equal(dictionaries.km["nasheed.send"], "ផ្ញើសុំការអនុម័ត")
    // Private tracks are never sent to the approval room.
    assert.match(readFileSync(join(process.cwd(), "src/lib/server/nasheed-review.ts"), "utf8"), /row\.status !== "PENDING" \|\| row\.notified \|\| !row\.audio_path\?\.startsWith\("sub:"\)/)
  })
})
