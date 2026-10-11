#!/usr/bin/env node
/**
 * Makes the SoundBox's 27 Khmer clips (public/audio/soundbox/khmer/<name>.mp3) with a licensed
 * text-to-speech service — iPhones ship no Khmer voice, so Khmer amounts are joined from these
 * clips. Run it on your own machine with your own key, set only in your terminal (never committed,
 * never pasted in chat):
 *
 *   Azure AI Speech (km-KH-SreymomNeural, the default when both are set — founder, 11/10/2026):
 *     AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=southeastasia node scripts/soundbox-khmer-tts.mjs
 *     (another Azure Khmer voice: KHMER_VOICE=km-KH-PisethNeural)
 *
 *   Google Cloud Text-to-Speech:
 *     GOOGLE_TTS_API_KEY=… node scripts/soundbox-khmer-tts.mjs
 *
 * Recordings by a Khmer speaker (docs/soundbox-khmer-audio.md) are just as good: the same file names.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const AZURE_KEY = process.env.AZURE_SPEECH_KEY?.trim()
const AZURE_REGION = process.env.AZURE_SPEECH_REGION?.trim()
const KEY = process.env.GOOGLE_TTS_API_KEY?.trim()
if (!(AZURE_KEY && AZURE_REGION) && !KEY) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (Azure AI Speech), or GOOGLE_TTS_API_KEY (Google Cloud TTS).")
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

const out = join(process.cwd(), "public", "audio", "soundbox", "khmer")
mkdirSync(out, { recursive: true })

if (AZURE_KEY && AZURE_REGION) {
  const base = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices`
  const headers = { "Ocp-Apim-Subscription-Key": AZURE_KEY }
  const list = await fetch(`${base}/voices/list`, { headers })
  if (!list.ok) {
    console.error(`Azure AI Speech refused the key / region (HTTP ${list.status}). Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. southeastasia).`)
    process.exit(1)
  }
  const khmer = (await list.json()).filter((v) => v.Locale === "km-KH").map((v) => v.ShortName)
  const voice = khmer.find((v) => v === (process.env.KHMER_VOICE || "km-KH-SreymomNeural")) ?? khmer[0]
  if (!voice) {
    console.error("Azure AI Speech lists no km-KH voice in this region.")
    process.exit(1)
  }
  console.log(`Azure Khmer voices: ${khmer.join(", ")} — using ${voice}`)
  const xml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  for (const [name, text] of Object.entries(WORDS)) {
    // Slightly quick and loud: joined clips should sound like one sentence on a counter speaker.
    const ssml = `<speak version="1.0" xml:lang="km-KH"><voice name="${voice}"><prosody rate="+10%" volume="+20%">${xml(text)}</prosody></voice></speak>`
    const res = await fetch(`${base}/v1`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "luychlat-soundbox" },
      body: ssml,
    })
    if (!res.ok) {
      console.error(`${name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
      process.exit(1)
    }
    writeFileSync(join(out, `${name}.mp3`), Buffer.from(await res.arrayBuffer()))
    console.log(`✓ ${name}.mp3  ${text}`)
  }
  console.log(`
27 clips in ${out}. Listen to a few, then commit public/audio/soundbox/khmer/.`)
  process.exit(0)
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
