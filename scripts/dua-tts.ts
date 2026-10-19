/**
 * Makes the du'a recordings with Azure AI Speech (founder, 19/10/2026 — licensed only, never Edge-TTS): for each du'a
 * in lib/duas.ts, its Arabic exactly as the card shows it (duaSsml), at a calm pace, brought to −16 LUFS with FFmpeg,
 * written to public/audio/duas/<id>.mp3. Then add each to DUA_RECORDINGS (the lines are printed) — the 🔊 appears.
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=southeastasia npx tsx scripts/dua-tts.ts [outDir]
 * Needs ffmpeg (the app container has it). An Imam should listen before the files are published.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { DUA_VOICE, duaSsml } from "../src/lib/dua-audio"
import { DUAS } from "../src/lib/duas"

async function main(outDir: string) {
  const key = process.env.AZURE_SPEECH_KEY?.trim()
  const region = process.env.AZURE_SPEECH_REGION?.trim()
  if (!key || !region) {
    console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (Azure AI Speech).")
    process.exit(2)
  }
  mkdirSync(outDir, { recursive: true })
  const voice = process.env.DUA_VOICE?.trim() || DUA_VOICE
  for (const d of DUAS) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3", "User-Agent": "luychlat-duas" },
      body: duaSsml(d.arabic, voice),
    })
    if (!res.ok) throw new Error(`${d.id}: Azure AI Speech HTTP ${res.status}`)
    const raw = path.join(outDir, `${d.id}.raw.mp3`)
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", path.join(outDir, `${d.id}.mp3`)])
    execFileSync("rm", ["-f", raw])
    console.log(`  "${d.id}": { file: "${d.id}.mp3", credit: "Azure AI Speech (${voice}) — reviewed by …" },`)
  }
}

void main(process.argv[2] ?? "public/audio/duas")
