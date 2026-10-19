import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isCacheableAudio } from "./audio-cache"
import { DUA_RECORDINGS, duaAudioReducer, duaAudioSrc } from "./dua-audio"
import { DUAS } from "./duas"

const off = { playing: null, repeat: false }

describe("Du'a recitations to listen to and memorise (founder, 19/10/2026)", () => {
  it("🔊 plays a du'a, ⏸ pauses it; another du'a stops the one playing", () => {
    let s = duaAudioReducer(off, { type: "toggle", id: "wake" })
    assert.deepEqual(s, { playing: "wake", repeat: false })
    s = duaAudioReducer(s, { type: "toggle", id: "sleep" })
    assert.equal(s.playing, "sleep")
    assert.equal(duaAudioReducer(s, { type: "toggle", id: "sleep" }).playing, null)
  })
  it("«🔁 ទន្ទេញ» keeps it playing at the end; without it, the end stops", () => {
    const playing = { playing: "wake", repeat: false }
    assert.equal(duaAudioReducer(playing, { type: "ended" }).playing, null)
    const looping = duaAudioReducer(playing, { type: "repeat" })
    assert.equal(looping.repeat, true)
    assert.equal(duaAudioReducer(looping, { type: "ended" }).playing, "wake")
  })
  it("a du'a has 🔊 only with a cleared recording in public/audio/duas/ — never a guessed file", () => {
    const rec = { wake: { file: "wake.mp3", credit: "Imam …, recorded with permission" }, bad: { file: "../x.mp3", credit: "?" } }
    assert.equal(duaAudioSrc("wake", rec), "/audio/duas/wake.mp3")
    assert.equal(duaAudioSrc("sleep", rec), null)
    assert.equal(duaAudioSrc("bad", rec), null)
    for (const [id, r] of Object.entries(DUA_RECORDINGS)) {
      assert.ok(DUAS.some((d) => d.id === id), `${id}: no such du'a`)
      assert.ok(r.credit.trim().length > 5, `${id}: who recited / cleared it`)
      assert.ok(readFileSync(join(process.cwd(), "public/audio/duas", r.file)).length > 1000, `${id}: the file`)
    }
  })
  it("kept for offline listening: the service worker routes /audio/duas/ through the recitations' cache", () => {
    assert.ok(isCacheableAudio("/audio/duas/wake.mp3"))
    assert.ok(isCacheableAudio("https://app.luychlat.com/audio/duas/leave-home.m4a"))
    assert.ok(!isCacheableAudio("/audio/sfx/pop_chime.mp3"))
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
    assert.match(sw, /url\.origin === self\.location\.origin && url\.pathname\.startsWith\("\/audio\/duas\/"\)/)
    assert.match(readFileSync(join(process.cwd(), "src/app/(app)/islamic/duas/page.tsx"), "utf8"), /<DuaAudioButton id=\{d\.id\} src=\{duaAudioSrc\(d\.id, DUA_RECORDINGS, urls\)\} \/>/)
  })
})

describe("Du'a recordings by Azure AI Speech (founder, 19/10/2026)", () => {
  it("the Arabic exactly as the card shows it, a calm pace, a pause at each «،» — Azure only, never Edge-TTS", async () => {
    const { duaSsml, DUA_VOICE } = await import("./dua-audio")
    const worry = DUAS.find((d) => d.id === "worry-debt")!
    const ssml = duaSsml(worry.arabic)
    assert.match(ssml, /xml:lang="ar-SA"><voice name="ar-SA-HamedNeural"><prosody rate="-15%">/)
    assert.equal((ssml.match(/،<break time="450ms"\/>/g) ?? []).length, (worry.arabic.match(/،/g) ?? []).length)
    assert.ok(ssml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").includes(worry.arabic.replace(/،\s*/g, "، ").replace(/\s+/g, " ").trim().split("، ")[0]))
    assert.equal(DUA_VOICE, "ar-SA-HamedNeural")
    const script = readFileSync(join(process.cwd(), "scripts/dua-tts.ts"), "utf8").replace(/^\s*(\*|\/\/).*$/gm, "")
    assert.match(script, /tts\.speech\.microsoft\.com\/cognitiveservices\/v1/)
    assert.doesNotMatch(script, /edge|bing\.com|readaloud/i)
    assert.match(script, /duaSsml\(d\.arabic, voice\)/) // the card's own text, never a second copy
  })
})

describe("The admin's du'a recordings — the card's «📤 បញ្ចូលសំឡេង» and /setdua (founder, 19/10/2026)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("an uploaded recording turns on 🔊 at once, before a shipped file; none → no button", async () => {
    const { duaRecordingUrl } = await import("./dua-audio")
    const url = duaRecordingUrl("https://db.example.co/", "wake-1760850000000.mp3")
    assert.equal(url, "https://db.example.co/storage/v1/object/public/dua-audio/wake-1760850000000.mp3")
    assert.equal(duaAudioSrc("wake", {}, { wake: url }), url)
    assert.equal(duaAudioSrc("wake", { wake: { file: "wake.mp3", credit: "Imam …, with permission" } }, { wake: url }), url)
    assert.equal(duaAudioSrc("sleep", {}, { wake: url }), null)
    // Kept for offline listening like the shipped files.
    assert.ok(isCacheableAudio(url))
    assert.ok(!isCacheableAudio("https://db.example.co/storage/v1/object/public/nasheed-audio/x.mp3"))
    assert.match(read("public/sw.js"), /url\.pathname\.startsWith\("\/storage\/v1\/object\/public\/dua-audio\/"\)/)
    assert.match(read("src/components/islamic/dua-audio-button.tsx"), /audio\.crossOrigin = "anonymous"/)
  })

  it("a new file name each time («<id>-<time>.mp3»), only for one of the nine du'as", async () => {
    const { duaAudioPath, isDuaAudioPath, isDuaId } = await import("./dua-audio")
    assert.equal(duaAudioPath("worry-debt", 1760850000000), "worry-debt-1760850000000.mp3")
    assert.ok(isDuaAudioPath("worry-debt", "worry-debt-1760850000000.mp3"))
    assert.ok(!isDuaAudioPath("worry-debt", "wake-1760850000000.mp3"))
    assert.ok(!isDuaAudioPath("worry-debt", "../worry-debt-1760850000000.mp3"))
    assert.ok(!isDuaAudioPath("nope", "nope-1760850000000.mp3"))
    for (const d of DUAS) assert.ok(isDuaId(d.id) && /^[a-z0-9-]{2,40}$/.test(d.id), d.id) // the table's check
    assert.ok(!isDuaId("x") && !isDuaId(undefined))
  })

  it("the upload asks for an audio file, its size, the reciter and the permission — one clear message each", async () => {
    const { duaUploadError, DUA_UPLOAD_MAX_BYTES } = await import("./dua-audio")
    const mp3 = { size: 200_000, type: "audio/mpeg", name: "wake.mp3" }
    const ok = { file: mp3, credit: "Imam Ahmad", rights: true }
    assert.equal(duaUploadError(ok), null)
    assert.equal(duaUploadError({ ...ok, file: { size: 90_000, type: "", name: "Recording.m4a" } }), null) // a phone recorder without a type
    assert.equal(duaUploadError({ ...ok, file: null }), "duas.upload.fileRequired")
    assert.equal(duaUploadError({ ...ok, file: { size: 10, type: "image/jpeg", name: "x.jpg" } }), "duas.upload.notAudio")
    assert.equal(duaUploadError({ ...ok, file: { ...mp3, size: DUA_UPLOAD_MAX_BYTES + 1 } }), "duas.upload.tooBig")
    assert.equal(duaUploadError({ ...ok, credit: " " }), "duas.upload.creditRequired")
    assert.equal(duaUploadError({ ...ok, rights: false }), "duas.upload.rightsRequired")
    assert.ok(DUA_UPLOAD_MAX_BYTES < 10 * 1024 * 1024) // under Nginx's 10 MB body limit
  })

  it("the bot's nine buttons carry the du'a (Telegram's 64-byte limit) and nothing else parses", async () => {
    const { duaPickButtons, isDuaCallback, isSetDuaCommand, parseDuaCallback } = await import("./dua-audio")
    const buttons = duaPickButtons().flat()
    assert.equal(buttons.length, DUAS.length)
    for (const b of buttons) {
      assert.ok(Buffer.byteLength(b.callback_data) <= 64)
      assert.ok(isDuaCallback(b.callback_data))
      assert.ok(DUAS.some((d) => d.id === parseDuaCallback(b.callback_data) && d.title.km === b.text))
    }
    assert.ok(duaPickButtons().every((row) => row.length <= 2))
    assert.equal(parseDuaCallback("da:../../etc"), null)
    assert.equal(parseDuaCallback("pa:wake"), null)
    assert.ok(isSetDuaCommand("/setdua") && isSetDuaCommand("/setdua@luychlat_bot") && !isSetDuaCommand("/setduas"))
  })

  it("only a super admin records one, audited; no member can write the bucket; the bot's function is callable", () => {
    const sql = read("supabase/migrations/20270182000000_dua_recordings.sql")
    assert.match(sql, /a\.role = 'super_admin'[\s\S]*raise exception 'super admin only'/)
    assert.match(sql, /perform public\.audit\('dua_recording_set'/)
    assert.match(sql, /perform public\.audit\('dua_recording_remove'/)
    assert.match(sql, /grant select on public\.dua_recordings to authenticated;/)
    assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*dua_recordings/)
    assert.doesNotMatch(sql, /on storage\.objects/) // writes only through the server's service key
    assert.match(sql, /'dua-audio', 'dua-audio', true/)
    assert.match(sql, /grant execute on function public\.bot_dua_recording_set\(text, bigint, text, text, text, text\) to anon, authenticated;/)
    assert.match(sql, /revoke all on function public\.dua_recording_put\(uuid, text, text, text, text\) from public, anon, authenticated;/)
    assert.match(sql, /public\.dua_recording_put\(public\.tip_chat_super_admin\(p_chat_id\)/)
    // The API route checks the caller before anything is stored.
    const route = read("src/app/api/duas/audio/route.ts")
    assert.match(route, /rpc\("is_admin"\)/) // a super admin or the «admin» staff role (19/10/2026)
    assert.match(route, /form\?\.get\("rights"\) !== "yes"/)
  })

  it("a voice note with no du'a waiting still goes to voice logging; an audio file is offered the du'as", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    assert.match(hook, /if \(duaFile && duaWantsAudio\(message\.chat\.id, duaFile\.kind\)\)/)
    assert.match(hook, /else await handleVoiceMessage\(chatId, voice, ctx\)/)
    const bot = read("src/lib/server/dua-audio-bot.ts")
    assert.match(bot, /export const duaWantsAudio = \(chatId: number, kind: DuaIncoming\["kind"\]\) => Boolean\(fresh\(chatId\)\?\.dua\) \|\| kind === "audio"/)
    assert.match(bot, /if \(file\.kind !== "audio" \|\| !\(await isSuperAdminChat\(chatId\)\)\) return false/)
    // ffmpeg cleans every recording the same way (−16 LUFS, mono MP3, capped length).
    assert.match(read("src/lib/server/dua-audio-store.ts"), /loudnorm=I=-16:TP=-1\.5:LRA=11", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame"/)
  })
})
