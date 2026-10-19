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
    assert.match(readFileSync(join(process.cwd(), "src/app/(app)/islamic/duas/page.tsx"), "utf8"), /<DuaAudioButton id=\{d\.id\} \/>/)
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
