#!/usr/bin/env node
/**
 * Makes the SoundBox's 27 Khmer clips (public/audio/soundbox/khmer/<name>.mp3) with Google Cloud
 * Text-to-Speech, a licensed service — iPhones ship no Khmer voice, so Khmer amounts are joined
 * from these clips. Run it on your own machine with your own key (never committed):
 *
 *   GOOGLE_TTS_API_KEY=… node scripts/soundbox-khmer-tts.mjs            # the first km-KH voice
 *   GOOGLE_TTS_API_KEY=… KHMER_VOICE=km-KH-Standard-B node scripts/soundbox-khmer-tts.mjs
 *
 * It lists Google's Khmer voices first and stops if there are none. Recordings by a Khmer speaker
 * (docs/soundbox-khmer-audio.md) are just as good: the same file names, then commit them.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const KEY = process.env.GOOGLE_TTS_API_KEY?.trim()
if (!KEY) {
  console.error("Set GOOGLE_TTS_API_KEY (a Google Cloud API key with Text-to-Speech enabled).")
  process.exit(1)
}

// The clip names the app plays (src/lib/soundbox.ts › KHMER_CLIPS) and what each one says.
const WORDS = {
  received: "ទទួលបានប្រាក់",
  1: "មួយ",
  2: "ពីរ",
  3: "បី",
  4: "បួន",
  5: "ប្រាំ",
  6: "ប្រាំមួយ",
  7: "ប្រាំពីរ",
  8: "ប្រាំបី",
  9: "ប្រាំបួន",
  10: "ដប់",
  20: "ម្ភៃ",
  30: "សាមសិប",
  40: "សែសិប",
  50: "ហាសិប",
  60: "ហុកសិប",
  70: "ចិតសិប",
  80: "ប៉ែតសិប",
  90: "កៅសិប",
  roy: "រយ",
  poan: "ពាន់",
  meun: "ម៉ឺន",
  saen: "សែន",
  lean: "លាន",
  riel: "រៀល",
  dollar: "ដុល្លារ",
  cent: "សេន",
}

const api = "https://texttospeech.googleapis.com/v1"
const voices = await fetch(`${api}/voices?languageCode=km-KH&key=${KEY}`).then((r) => r.json())
const khmer = (voices.voices ?? []).filter((v) => v.languageCodes?.includes("km-KH"))
if (!khmer.length) {
  console.error("Google Cloud Text-to-Speech lists no km-KH voice for this key/project:", JSON.stringify(voices.error ?? voices).slice(0, 300))
  console.error("Record the 27 words instead (docs/soundbox-khmer-audio.md).")
  process.exit(1)
}
const voice = khmer.find((v) => v.name === process.env.KHMER_VOICE) ?? khmer[0]
console.log(`Khmer voices: ${khmer.map((v) => v.name).join(", ")} — using ${voice.name}`)

const out = join(process.cwd(), "public", "audio", "soundbox", "khmer")
mkdirSync(out, { recursive: true })
for (const [name, text] of Object.entries(WORDS)) {
  const res = await fetch(`${api}/text:synthesize?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "km-KH", name: voice.name },
      // Slightly quick and loud: joined clips should sound like one sentence on a counter speaker.
      audioConfig: { audioEncoding: "MP3", speakingRate: 1.1, volumeGainDb: 2, sampleRateHertz: 24000 },
    }),
  }).then((r) => r.json())
  if (!res.audioContent) {
    console.error(`${name}: ${JSON.stringify(res.error ?? res).slice(0, 200)}`)
    process.exit(1)
  }
  writeFileSync(join(out, `${name}.mp3`), Buffer.from(res.audioContent, "base64"))
  console.log(`✓ ${name}.mp3  ${text}`)
}
console.log(`\n27 clips in ${out}. Listen to a few, then commit public/audio/soundbox/khmer/.`)
