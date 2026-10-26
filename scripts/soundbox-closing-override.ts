/**
 * OWNER OVERRIDE — the 5 SoundBox closing-summary clips only (founder, 26/10/2026 — Task #508): Google Cloud TTS needs
 * billing on the founder's project, so he authorised the same source as the 27 clips (Task #464): Google Translate's free
 * speech endpoint (`translate_tts`, tl=km) — NOT a licensed API. Same voice as the 27, so the closing summary sounds like
 * one speaker. The founder accepted the risk; replace all 32 clips with licensed audio (scripts/soundbox-closing-tts.ts,
 * scripts/soundbox-khmer-tts.mjs) or a Khmer speaker's recordings when possible — the same file names. No other asset may
 * use this endpoint (CLAUDE.md › Licensing).
 *
 *   npx tsx scripts/soundbox-closing-override.ts            (needs ffmpeg: PATH, FFMPEG=<path> or ffmpeg-static)
 *
 * Every word is made exactly like the 27 (src/lib/soundbox-clips.ts): trimmed, brought to their loudness, limited,
 * encoded mono 24 kHz 64 kbps without tags, then the x1.2 / x1.3 sets; a clip off their loudness stops it (exit 1).
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { CLIP_FORMAT, clipGainDb, clipMatches, encodeArgs, parseVolume, tempoArgs, trimFilter } from "../src/lib/soundbox-clips"
import { CLOSING_WORDS } from "../src/lib/soundbox"

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
  const work = mkdtempSync(path.join(tmpdir(), "soundbox-closing-"))
  for (const sp of CLIP_FORMAT.speeds) mkdirSync(path.join(outDir, `x${sp}`), { recursive: true })
  let failed = 0
  try {
    for (const [name, text] of Object.entries(CLOSING_WORDS)) {
      const url = `${SPEECH}?ie=UTF-8&tl=km&client=tw-ob&q=${encodeURIComponent(text)}`
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
      const body = Buffer.from(await res.arrayBuffer())
      if (!res.ok || body.length < 1000) throw new Error(`${name}: HTTP ${res.status}, ${body.length} bytes`)
      const raw = path.join(work, `${name}.mp3`)
      writeFileSync(raw, body)

      // Measure the trimmed word, bring it to the 27's loudness, encode exactly like them, then check it.
      const trimmed = path.join(work, `${name}-trim.wav`)
      execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", trimFilter(), trimmed])
      const gain = clipGainDb(volume(ff, trimmed).mean)
      if (gain === null) throw new Error(`${name}: the speech is silent or far too quiet — not amplified`)
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
    console.error(`\n${failed} clip(s) do not match the 27's loudness — do not commit them.`)
    process.exit(1)
  }
  console.log(`\n${Object.keys(CLOSING_WORDS).length} clips (+ x1.2, x1.3) in ${outDir}. Listen, then commit public/audio/soundbox/khmer/.`)
}

main(process.argv[2] ?? path.join(process.cwd(), "public", "audio", "soundbox", "khmer")).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
