/**
 * Makes the SoundBox closing-summary clips (founder, 24/10/2026 — Task #490): «សរុបថ្ងៃនេះ», «និង», «ការលក់», «ដង»,
 * «អរគុណ» (CLOSING_WORDS in src/lib/soundbox.ts) with licensed Google Cloud Text-to-Speech — never translate_tts (the
 * owner override covers the 27 clips only). Each clip is brought to the 27's exact format and loudness
 * (src/lib/soundbox-clips.ts), then its 1.2x and 1.3x sets are made the same way as theirs. Run it on your own machine
 * with your own key, set only in your terminal (never committed, never pasted in chat):
 *
 *   GOOGLE_TTS_API_KEY=… npx tsx scripts/soundbox-closing-tts.ts
 *   (another voice: KHMER_VOICE=km-KH-Standard-B · a dry run into a folder: … scripts/soundbox-closing-tts.ts /tmp/clips)
 *
 * Needs ffmpeg: on the PATH, FFMPEG=<path>, or `npm i --no-save ffmpeg-static`. Listen to every clip joined with the
 * 27 (the «សាកស្ដាប់» button) before committing public/audio/soundbox/khmer/.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { CLIP_FORMAT, clipGainDb, clipMatches, encodeArgs, parseVolume, tempoArgs, trimFilter } from "../src/lib/soundbox-clips"
import { CLOSING_WORDS } from "../src/lib/soundbox"

const API = "https://texttospeech.googleapis.com/v1"

function ffmpegPath(): string {
  if (process.env.FFMPEG?.trim()) return process.env.FFMPEG.trim()
  try {
    const p = createRequire(import.meta.url)("ffmpeg-static") as string | null
    if (p) return p
  } catch {
    // not installed: the PATH
  }
  return "ffmpeg"
}

function volume(ff: string, file: string) {
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" })
  const v = parseVolume(r.stderr ?? "")
  if (!v) throw new Error(`${path.basename(file)}: ffmpeg measured nothing`)
  return v
}

async function main(outDir: string) {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim()
  if (!key) {
    console.error("Set GOOGLE_TTS_API_KEY (Google Cloud Text-to-Speech) in this terminal only.")
    process.exit(2)
  }
  const ff = ffmpegPath()
  if (spawnSync(ff, ["-version"]).status !== 0) {
    console.error("ffmpeg not found: put it on the PATH, set FFMPEG=<path>, or run `npm i --no-save ffmpeg-static`.")
    process.exit(2)
  }
  const voices = (await fetch(`${API}/voices?languageCode=km-KH&key=${key}`).then((r) => r.json())) as { voices?: { name: string; languageCodes?: string[] }[]; error?: unknown }
  const khmer = (voices.voices ?? []).filter((v) => v.languageCodes?.includes("km-KH"))
  if (!khmer.length) {
    console.error("Google Cloud Text-to-Speech lists no km-KH voice for this key / project:", JSON.stringify(voices.error ?? voices).slice(0, 300))
    process.exit(1)
  }
  const voice = khmer.find((v) => v.name === process.env.KHMER_VOICE?.trim()) ?? khmer[0]
  console.log(`Khmer voices: ${khmer.map((v) => v.name).join(", ")} — using ${voice.name}`)

  const work = mkdtempSync(path.join(tmpdir(), "soundbox-closing-"))
  for (const sp of CLIP_FORMAT.speeds) mkdirSync(path.join(outDir, `x${sp}`), { recursive: true })
  let failed = 0
  try {
    for (const [name, text] of Object.entries(CLOSING_WORDS)) {
      // Lossless from Google at the clips' rate; the 1.0x pace like the 27 (the faster sets come from atempo).
      const res = (await fetch(`${API}/text:synthesize?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text }, voice: { languageCode: "km-KH", name: voice.name }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: CLIP_FORMAT.sampleRate } }),
      }).then((r) => r.json())) as { audioContent?: string; error?: unknown }
      if (!res.audioContent) throw new Error(`${name}: ${JSON.stringify(res.error ?? res).slice(0, 200)}`)
      const raw = path.join(work, `${name}.wav`)
      writeFileSync(raw, Buffer.from(res.audioContent, "base64"))

      // Measure the trimmed word, bring it to the 27's loudness, encode exactly like them, then check it.
      const trimmed = path.join(work, `${name}-trim.wav`)
      execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", trimFilter(), trimmed])
      const gain = clipGainDb(volume(ff, trimmed).mean)
      if (gain === null) throw new Error(`${name}: the synthesis is silent or far too quiet — not amplified`)
      const out = path.join(outDir, `${name}.mp3`)
      execFileSync(ff, encodeArgs(raw, out, gain))
      const v = volume(ff, out)
      const ok = clipMatches(v)
      if (!ok) failed++
      for (const sp of CLIP_FORMAT.speeds) execFileSync(ff, tempoArgs(out, path.join(outDir, `x${sp}`, `${name}.mp3`), sp))
      console.log(`${ok ? "✓" : "✗"} ${name}.mp3  ${text}  gain ${gain} dB → mean ${v.mean} dB, peak ${v.peak} dB${ok ? "" : `  (the 27: mean ${CLIP_FORMAT.meanVolumeDb} ±1, peak ≤ ${CLIP_FORMAT.peakDb})`}`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  if (failed) {
    console.error(`\n${failed} clip(s) do not match the 27's loudness — do not commit them; try another KHMER_VOICE.`)
    process.exit(1)
  }
  console.log(`\n${Object.keys(CLOSING_WORDS).length} clips (+ x1.2, x1.3) in ${outDir}, voice ${voice.name}. Listen, then commit public/audio/soundbox/khmer/.`)
}

main(process.argv[2] ?? path.join(process.cwd(), "public", "audio", "soundbox", "khmer")).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
