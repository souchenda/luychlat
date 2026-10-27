/**
 * OWNER OVERRIDE — the 2 welcome greeting clips only (founder, 27/10/2026 — Task #522): Google Cloud TTS needs billing and
 * Azure sign-up was blocked, so the founder extended the SoundBox clips' override (Task #464 / #508) to the greeting:
 * Google Translate's free speech endpoint (`translate_tts`, tl=km) — NOT a licensed API — the same voice as the SoundBox.
 * The founder accepted the risk; replace them with licensed audio or a Khmer speaker's recordings when possible — the same
 * file names. No other asset may use this endpoint (CLAUDE.md › Licensing).
 *
 *   npx tsx scripts/greeting-clips-override.ts            (needs ffmpeg: PATH, FFMPEG=<path> or ffmpeg-static)
 *
 * The words are lib/welcome-greeting.ts › GREETING_WORDS (the Salam in Arabic, by the Arabic voice — Task #523). Each clip is made like the
 * SoundBox clips (src/lib/soundbox-clips.ts): trimmed, brought to their loudness, limited, mono 24 kHz 64 kbps without tags;
 * a clip off their loudness stops it (exit 1). Female only — there is no male Khmer voice; a phone set to 👨 hears these.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { clipGainDb, clipMatches, encodeArgs, parseVolume, trimFilter } from "../src/lib/soundbox-clips"
import { GREETING_WORDS } from "../src/lib/welcome-greeting"

const SPEECH = "https://translate.google.com/translate_tts"

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
  const ff = ffmpegPath()
  if (spawnSync(ff, ["-version"]).status !== 0) {
    console.error("ffmpeg not found: put it on the PATH, set FFMPEG=<path>, or run `npm i --no-save ffmpeg-static`.")
    process.exit(2)
  }
  const work = mkdtempSync(path.join(tmpdir(), "greeting-"))
  mkdirSync(outDir, { recursive: true })
  let failed = 0
  try {
    // Each in its own language (Task #523): the Khmer welcome by the Khmer voice, the Salam in Arabic by the Arabic voice.
    for (const [name, { text, lang }] of Object.entries(GREETING_WORDS)) {
      const res = await fetch(`${SPEECH}?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`, { headers: { "User-Agent": "Mozilla/5.0" } })
      const body = Buffer.from(await res.arrayBuffer())
      if (!res.ok || body.length < 1000) throw new Error(`${name}: HTTP ${res.status}, ${body.length} bytes`)
      const raw = path.join(work, `${name}.mp3`)
      writeFileSync(raw, body)
      const trimmed = path.join(work, `${name}-trim.wav`)
      execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", trimFilter(), trimmed])
      const gain = clipGainDb(volume(ff, trimmed).mean)
      if (gain === null) throw new Error(`${name}: the speech is silent or far too quiet — not amplified`)
      const out = path.join(outDir, `${name}.mp3`)
      execFileSync(ff, encodeArgs(raw, out, gain))
      const v = volume(ff, out)
      const ok = clipMatches(v)
      if (!ok) failed++
      console.log(`${ok ? "✓" : "✗"} ${name}.mp3  ${text}  gain ${gain} dB → mean ${v.mean} dB, peak ${v.peak} dB`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  if (failed) {
    console.error(`\n${failed} clip(s) off the SoundBox clips' loudness — do not commit them.`)
    process.exit(1)
  }
  console.log(`\n${Object.keys(GREETING_WORDS).length} clips in ${outDir}. Listen, then commit public/audio/greeting/.`)
}

main(process.argv[2] ?? path.join(process.cwd(), "public", "audio", "greeting", "female")).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
