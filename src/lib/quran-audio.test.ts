import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { afterSurah, clock, QURAN_AUDIO_HOST, quranAudioUrl, sleepAfter, sleepDue } from "./quran-audio"

describe("Quran audio — streamed from MP3Quran's official CDN", () => {
  it("surah 1, 18 and 114 by Mishary Alafasy (Hafs, Murattal)", () => {
    assert.equal(quranAudioUrl(1), "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/001.mp3")
    assert.equal(quranAudioUrl(18), "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/018.mp3")
    assert.equal(quranAudioUrl(114), "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/114.mp3")
    assert.throws(() => quranAudioUrl(0))
    assert.throws(() => quranAudioUrl(115))
  })
  it("the CSP allows media from that host only (nothing stored on our server)", () => {
    const cfg = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
    // The CDN, plus our own Supabase storage for the cleared nasheed recordings — nothing else.
    assert.ok(cfg.includes(`\`media-src 'self' blob: ${QURAN_AUDIO_HOST} \${supabaseOrigin}\``))
  })
})

describe("Quran audio — sleep timer and what plays next", () => {
  it("15 / 30 / 60 minutes: due at that time, not before", () => {
    const t = sleepAfter(15, 1_000)
    assert.equal(sleepDue(t, 1_000 + 15 * 60_000 - 1), false)
    assert.equal(sleepDue(t, 1_000 + 15 * 60_000), true)
    assert.equal(sleepDue(null, Date.now()), false)
  })
  it("a surah ends: the next plays on; «at the end of the surah» stops; nothing after 114", () => {
    assert.equal(afterSurah(1, null), 2)
    assert.equal(afterSurah(1, sleepAfter(30, 0)), 2)
    assert.equal(afterSurah(1, { kind: "surah" }), null)
    assert.equal(afterSurah(114, null), null)
  })
  it("the scrubber's clock", () => {
    assert.equal(clock(65), "1:05")
    assert.equal(clock(3723), "1:02:03")
    assert.equal(clock(Number.NaN), "0:00")
  })
})
