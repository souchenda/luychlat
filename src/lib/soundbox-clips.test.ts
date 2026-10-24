import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { CLOSING_CLIPS, CLOSING_WORDS, KHMER_CLIPS } from "./soundbox"
import { CLIP_FORMAT, clipGainDb, clipMatches, encodeArgs, parseVolume, tempoArgs, trimFilter } from "./soundbox-clips"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("The closing-summary clips, made like the 27 (founder, 24/10/2026 — Task #490)", () => {
  it("five Khmer words, apart from the 27 — the sale announcement never waits for them", () => {
    assert.deepEqual(CLOSING_CLIPS, ["today_total", "and", "sales", "times", "thanks"])
    assert.deepEqual(Object.values(CLOSING_WORDS), ["សរុបថ្ងៃនេះ", "និង", "ការលក់", "ដង", "អរគុណ"])
    assert.ok(CLOSING_CLIPS.every((c) => !(KHMER_CLIPS as readonly string[]).includes(c)))
    assert.equal(KHMER_CLIPS.length, 27)
  })

  it("the 27's encoding: mono 24 kHz MP3 at 64 kbps, no tags; the Task #465 trim; atempo for x1.2 and x1.3", () => {
    assert.equal(trimFilter(), "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,adelay=15,apad=pad_dur=0.02")
    const enc = encodeArgs("in.wav", "out.mp3", 3.5)
    assert.equal(enc[enc.indexOf("-af") + 1], `${trimFilter()},volume=3.5dB,alimiter=limit=0.794:level=disabled`)
    assert.deepEqual(enc.slice(-13), ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", "-id3v2_version", "0", "out.mp3"])
    assert.deepEqual(CLIP_FORMAT.speeds, [1.2, 1.3])
    assert.deepEqual(tempoArgs("a.mp3", "x1.2/a.mp3", 1.2).slice(6, 8), ["-af", "atempo=1.2"])
  })

  it("the 27's loudness: brought to their median −19 dB; a silent or far-off synthesis never amplified; checked after", () => {
    assert.deepEqual([clipGainDb(-25), clipGainDb(-12.4), clipGainDb(-19)], [6, -6.6, 0])
    assert.deepEqual([clipGainDb(-40), clipGainDb(-Infinity), clipGainDb(NaN)], [null, null, null])
    assert.deepEqual(parseVolume("[Parsed_volumedetect_0] mean_volume: -19.5 dB\n[Parsed_volumedetect_0] max_volume: -6.5 dB"), { mean: -19.5, peak: -6.5 })
    assert.equal(parseVolume("no audio"), null)
    assert.deepEqual([clipMatches({ mean: -19.5, peak: -6.5 }), clipMatches({ mean: -21, peak: -6 }), clipMatches({ mean: -19, peak: -0.5 })], [true, false, false])
  })

  it("licensed only: the script calls Google Cloud Text-to-Speech, never translate_tts; the key only from the terminal", () => {
    const s = read("scripts/soundbox-closing-tts.ts")
    assert.match(s, /const API = "https:\/\/texttospeech\.googleapis\.com\/v1"/)
    assert.deepEqual([...new Set(s.match(/https:\/\/[^\s"`/]+/g))], ["https://texttospeech.googleapis.com"]) // the only host it calls
    assert.deepEqual(s.match(/fetch\(`\$\{API\}/g)?.length, 2) // the voice list and the synthesis, both through API
    assert.match(s, /process\.env\.GOOGLE_TTS_API_KEY/)
    assert.match(s, /if \(failed\) \{/) // a clip off the 27's loudness is never left to commit silently
  })
})
