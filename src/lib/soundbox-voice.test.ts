import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { paymentClips } from "./payment-chime"
import {
  CLOSING_CLIPS,
  DEFAULT_VOICE_GENDER,
  KHMER_CLIPS,
  MALE_VOICE_READY,
  VOICE_GENDER_KEY,
  VOICE_SPEEDS,
  khmerClipUrl,
  playedVoice,
  readVoiceGender,
  voiceDir,
  writeVoiceGender,
} from "./soundbox"
import { catchUpItem, feedItems, feedVoice } from "./soundbox-feed"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe("SoundBox voice persona — 👩 female (default) or 👨 male, per device (founder, 26/10/2026 — Task #509)", () => {
  it("remembered on this phone as «soundbox_voice_gender»; never set, an old value or private mode → female", () => {
    const store = memory()
    assert.equal(VOICE_GENDER_KEY, "soundbox_voice_gender")
    assert.equal(readVoiceGender(store), "female")
    writeVoiceGender(store, "male")
    assert.equal(store.m.get("soundbox_voice_gender"), "male")
    assert.equal(readVoiceGender(store), "male")
    store.setItem(VOICE_GENDER_KEY, "robot")
    assert.equal(readVoiceGender(store), "female")
    const broken = { getItem: () => { throw new Error("private") }, setItem: () => { throw new Error("private") } }
    assert.equal(readVoiceGender(broken), "female")
    assert.doesNotThrow(() => writeVoiceGender(broken, "male"))
    assert.equal(readVoiceGender(null), DEFAULT_VOICE_GENDER)
  })

  it("routing: female at the root (the clips as deployed), male in male/ — each with its x1.2 / x1.3", () => {
    assert.deepEqual([voiceDir("female"), voiceDir("male")], ["", "male/"])
    assert.equal(khmerClipUrl("riel", 1, "female"), "/audio/soundbox/khmer/riel.mp3")
    assert.equal(khmerClipUrl("riel", 1.3, "female"), "/audio/soundbox/khmer/x1.3/riel.mp3")
    assert.equal(khmerClipUrl("thanks", 1.2), "/audio/soundbox/khmer/x1.2/thanks.mp3") // the default stays female
    const male = (speed: 1 | 1.2 | 1.3) => khmerClipUrl("riel", speed, "male")
    if (MALE_VOICE_READY) assert.deepEqual(VOICE_SPEEDS.map(male), ["/audio/soundbox/khmer/male/riel.mp3", "/audio/soundbox/khmer/male/x1.2/riel.mp3", "/audio/soundbox/khmer/male/x1.3/riel.mp3"])
    else assert.deepEqual(VOICE_SPEEDS.map(male), VOICE_SPEEDS.map((s) => khmerClipUrl("riel", s, "female")))
  })

  it("the male voice before its clips: the female voice plays (never silence); ready → all 32 clips × 3 speeds are in male/", () => {
    assert.equal(playedVoice("female"), "female")
    assert.equal(playedVoice("male"), MALE_VOICE_READY ? "male" : "female")
    if (!MALE_VOICE_READY) return
    for (const speed of VOICE_SPEEDS)
      for (const clip of [...KHMER_CLIPS, ...CLOSING_CLIPS]) {
        const file = join(process.cwd(), "public", "audio", "soundbox", "khmer", "male", speed === 1 ? "" : `x${speed}`, `${clip}.mp3`)
        assert.ok(existsSync(file), file)
      }
  })

  it("every player follows the choice: the page, the app-wide chime listener, the server feed (native APK) and the catch-up", () => {
    assert.deepEqual(paymentClips({ amount: 10_000, currency: "KHR" }, 1, "female"), ["/audio/soundbox/khmer/received.mp3", "/audio/soundbox/khmer/1.mp3", "/audio/soundbox/khmer/meun.mp3", "/audio/soundbox/khmer/riel.mp3"])
    assert.deepEqual([feedVoice("male"), feedVoice("female"), feedVoice(null), feedVoice("x")], ["male", "female", "female", "female"])
    const row = { id: "a", amount: 5000, currency: "KHR", transaction_time: null, created_at: new Date(1_000_000).toISOString() }
    const female = feedItems([row], 1_000_000, 1.2, "https://o")[0].clips
    assert.deepEqual(feedItems([row], 1_000_000, 1.2, "https://o", "female")[0].clips, female)
    assert.ok(female.every((u) => u.startsWith("https://o/audio/soundbox/khmer/x1.2/")))
    assert.deepEqual(feedItems([row], 1_000_000, 1.2, "https://o", "male")[0].clips, MALE_VOICE_READY ? female.map((u) => u.replace("/khmer/", "/khmer/male/")) : female)
    const span = { from: 0, to: 2_000_000 }
    assert.ok(catchUpItem([row], span, 1, "https://o", "male")!.clips.every((u) => u.includes(MALE_VOICE_READY ? "/khmer/male/" : "/khmer/")))

    const page = read("src/app/(app)/soundbox/page.tsx")
    assert.equal((page.match(/readVoiceSpeed\(store\(\)\), readVoiceGender\(store\(\)\)\)/g) ?? []).length, 6) // every unlock and announce
    assert.match(page, /speed: String\(readVoiceSpeed\(store\(\)\)\), voice: readVoiceGender\(store\(\)\) \}/)
    const audio = read("src/lib/soundbox-audio.ts")
    assert.match(audio, /const setKey = \(speed: VoiceSpeed, gender: VoiceGender\) => `\$\{playedVoice\(gender\)\}:\$\{speed\}`/)
    assert.match(audio, /fetch\(khmerClipUrl\(name, speed, gender\)/)
    const listener = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(listener, /playClips\(paymentClips\(e, voiceSpeed\(\), voiceGender\(\)\)\)/)
    assert.match(read("src/app/api/soundbox/feed/route.ts"), /const voice = feedVoice\(url\.searchParams\.get\("voice"\)\)/)
    // The Android service sends it (an older APK sends none → female, as before).
    assert.match(read("android/app/src/main/java/com/luychlat/app/SoundboxFeed.java"), /\+ "&speed=" \+ enc\(speed\) \+ "&voice=" \+ enc\(voice\);/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAlivePlugin.java"), /intent\.putExtra\("voice", call\.getString\("voice", "female"\)\);/)
  })

  it("settings: the two voices as a segmented pill, «សាកល្បង» under each («ទទួលបានប្រាក់ មួយម៉ឺនរៀល»), the wait said plainly", () => {
    const page = read("src/app/(app)/settings/page.tsx")
    assert.ok(page.indexOf("<VoiceSpeedRow />") < page.indexOf("<VoiceGenderRow />"))
    assert.match(page, /return business \? <VoiceGenderPicker \/> : null/) // Business only, like the speed
    const s = read("src/components/settings/voice-gender-row.tsx")
    assert.match(s, /options=\{VOICE_GENDERS\.map\(\(g\) => \(\{ value: g, label: label\(g\) \}\)\)\}/)
    assert.match(s, /disabled=\{g === "male" && !MALE_VOICE_READY\}/)
    assert.match(s, /onClick=\{\(\) => previewVoice\(g\)\}/)
    assert.match(s, /hint=\{gender === "male" && !MALE_VOICE_READY \? t\("settings\.voiceMalePending"\) : undefined\}/)
    assert.match(read("src/components/payments/payment-chime-listener.tsx"), /void playClips\(paymentClips\(\{ amount: 10_000, currency: "KHR" \}, voiceSpeed\(\), gender\)\)/)
    const km = dictionaries.km as Record<string, string>
    assert.deepEqual([km["settings.voiceFemale"], km["settings.voiceMale"], km["settings.voicePreview"]], ["👩 សំឡេងស្រី", "👨 សំឡេងប្រុស", "សាកល្បង"])
    assert.doesNotMatch(km["settings.voiceMalePending"], /លោក/)
    for (const l of ["en", "zh"] as const) assert.ok((dictionaries[l] as Record<string, string>)["settings.voiceMalePending"], l)
  })
})
