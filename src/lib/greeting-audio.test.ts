import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ASSALAMU_ALAIKUM } from "@/lib/islamic/glossary"
import { VOICE_GENDERS } from "@/lib/soundbox"

import { GREETING_CLIPS_READY, GREETING_MALE_READY, GREETING_SALAM_TEXT, GREETING_WORDS, greetingClipUrl } from "./welcome-greeting"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n")

/** The first MPEG frame: MPEG-2 Layer III, 24 kHz, 64 kbps, mono — the SoundBox clips' encoding. */
function mp3Header(file: string) {
  const b = readFileSync(file)
  const i = b.findIndex((x, k) => x === 0xff && (b[k + 1]! & 0xe0) === 0xe0)
  return {
    version: (b[i + 1]! >> 3) & 3,
    layer: (b[i + 1]! >> 1) & 3,
    kbps: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160][b[i + 2]! >> 4],
    rate: [22050, 24000, 16000][(b[i + 2]! >> 2) & 3],
    mono: b[i + 3]! >> 6 === 3,
  }
}

describe("The spoken welcome greeting's clips (founder, 27/10/2026 — Task #522)", () => {
  it("every voice and kind resolves to a clip that exists — no 404 when the greeting plays (👨 falls back to the female clip)", () => {
    assert.equal(GREETING_CLIPS_READY, true)
    for (const voice of VOICE_GENDERS)
      for (const kind of ["khmer", "islamic"] as const) {
        const url = greetingClipUrl(kind, voice)
        const file = join(root, "public", url)
        assert.ok(existsSync(file), `${voice}/${kind}: ${url}`)
        assert.ok(statSync(file).size > 4_000, `${url} holds speech`)
      }
  })
  it("the SoundBox clips' encoding: MPEG-2 Layer III, 24 kHz, 64 kbps, mono", () => {
    for (const name of ["chumreap", "salam"]) {
      assert.deepEqual(mp3Header(join(root, "public", "audio", "greeting", "female", `${name}.mp3`)), { version: 2, layer: 1, kbps: 64, rate: 24_000, mono: true }, name)
    }
  })
  it("what they say: the Khmer welcome with the brand's name; the Salam in the glossary's spelling (never retyped)", () => {
    // Founder, 28/10/2026: «ជម្រាបសួរបង», no pause-making «!» or space, a little faster.
    assert.deepEqual(GREETING_WORDS.chumreap, { text: "ជម្រាបសួរបង សូមស្វាគមន៍មកកាន់អេបលុយឆ្លាត", lang: "km", tempo: 1.12 })
    assert.doesNotMatch(GREETING_WORDS.chumreap.text, /កម្មវិធី|អែប|LuyChlat/) // the brand standard
    // Task #523: the Salam spoken in ARABIC by the Arabic voice (never a Khmer voice reading a transliteration);
    // the banner keeps the glossary's Khmer spelling.
    assert.deepEqual(GREETING_WORDS.salam, { text: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ", lang: "ar", tempo: 1 })
    assert.match(GREETING_WORDS.salam.text, /^[\u0600-\u06FF\s]+$/)
    assert.equal(GREETING_SALAM_TEXT, ASSALAMU_ALAIKUM)
  })
  it("made under the owner's override only: translate_tts in that script alone, recorded in CLAUDE.md; loudness checked", () => {
    const s = read("scripts/greeting-clips-override.ts")
    assert.deepEqual([...new Set(s.match(/https:\/\/[^\s"`/]+/g))], ["https://translate.google.com"])
    assert.match(s, /for \(const \[name, \{ text, lang, tempo \}\] of Object\.entries\(GREETING_WORDS\)\)/)
    assert.match(s, /`atempo=\$\{tempo\}`/) // faster without a higher pitch
    assert.match(s, /tl=\$\{lang\}/) // each in its own language
    assert.match(s, /const ok = clipMatches\(v\)/)
    assert.match(read("CLAUDE.md"), /\*\*And to the 2 welcome greeting clips \(founder, 27\/10\/2026 —\s+Task #522\):\*\*/)
  })
  it("played at launch when allowed; refused by the browser (autoplay) → at the first touch within 15 s, once; quiet phone → never", () => {
    const pill = read("src/components/dashboard/welcome-greeting.tsx")
    assert.match(pill, /export const FIRST_TOUCH_MS = 15_000/)
    assert.match(pill, /if \(done \|\| \(error as \{ name\?: string \} \| null\)\?\.name !== "NotAllowedError"\) return/)
    assert.match(pill, /window\.addEventListener\("pointerdown", retry, \{ once: true \}\)/)
    assert.match(pill, /if \(gone \|\| !shouldSpeakWelcome\(\{ enabled: true, ready: GREETING_CLIPS_READY, quiet \}\)\) return/)
    // The clip: the Salam, and the Khmer welcome when the phone's own voice cannot speak it (khmer-voice.test.ts).
    assert.match(pill, /const gender = readVoiceGender\(local\)/)
    assert.equal((pill.match(/stopSpeaking = speakOnLaunch\(greetingClipUrl\(g\.kind, gender\)\)/g) ?? []).length, 2)
  })
})

describe("A native speaker's recording replaces a clip (founder, 27/10/2026 — Task #523)", () => {
  it("the importer: any phone recording → the SoundBox clips' standard; too short / long / faint is refused, never amplified", () => {
    const s = read("scripts/import-greeting-voice.ts")
    assert.match(s, /"-ac", "1", "-ar", "24000", "-af", `highpass=f=70,\$\{trimFilter\(\)\}`/) // mono 24 kHz, rumble off, trimmed
    assert.match(s, /export const MIN_SECONDS = 0\.6\nexport const MAX_SECONDS = 8/)
    assert.match(s, /if \(gain === null\) throw new Error\("silent or far too faint/)
    assert.match(s, /const ok = clipMatches\(v\)/)
    assert.match(s, /public", "audio", "greeting", voice/)
    assert.doesNotMatch(s, /https?:\/\//) // a local file only — nothing fetched
  })
  it("male clips only once both are imported and switched on; until then 👨 hears the female ones", () => {
    assert.equal(GREETING_MALE_READY, false)
    assert.equal(greetingClipUrl("islamic", "male"), "/audio/greeting/female/salam.mp3")
  })
})
