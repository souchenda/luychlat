/**
 * A real voice for the welcome greeting (founder, 27/10/2026 — Task #523: «it sounds robotic … make sure the pronunciation
 * reflects native speakers»). Drop in a recording — a Telegram voice note (.ogg), an iPhone memo (.m4a), .mp3, .wav — of a
 * native speaker, and it becomes the app's clip, made exactly like the SoundBox clips (src/lib/soundbox-clips.ts): rumble
 * below 70 Hz off, the silence before and after trimmed (15 ms / 20 ms kept), brought to their loudness (mean −19 dB ±1),
 * limited at their loudest peak, mono 24 kHz 64 kbps without tags. A recording too short, too long, silent or too faint is
 * refused — never amplified into noise.
 *
 *   npx tsx scripts/import-greeting-voice.ts <recording> chumreap|salam [female|male]
 *
 *   chumreap  the Khmer welcome  — e.g. «ជម្រាបសួរ! សូមស្វាគមន៍មកកាន់ អេប លុយឆ្លាត»
 *   salam     the Islamic one    — «السلام عليكم ورحمة الله وبركاته», in Arabic, by a native reader
 *
 * Writes public/audio/greeting/<voice>/<kind>.mp3. A male recording is used once BOTH male clips are in and
 * GREETING_MALE_READY is true (lib/welcome-greeting.ts) — until then a phone set to 👨 hears the female clips.
 * Needs ffmpeg (on the PATH, FFMPEG=<path>, or `npm i --no-save ffmpeg-static`). Listen before committing.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { clipGainDb, clipMatches, encodeArgs, parseVolume, trimFilter } from "../src/lib/soundbox-clips"

/** A greeting is a few words: shorter is a mis-tap, longer is not a greeting. */
export const MIN_SECONDS = 0.6
export const MAX_SECONDS = 8

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
  if (!v) throw new Error(`${path.basename(file)}: ffmpeg measured nothing (is it audio?)`)
  return v
}

function seconds(ff: string, file: string): number {
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-f", "null", "-"], { encoding: "utf8" })
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g
  let last = 0
  for (const x of (r.stderr ?? "").matchAll(m)) last = Number(x[1]) * 3600 + Number(x[2]) * 60 + Number(x[3])
  return last
}

function main() {
  const [input, kind, voice = "female"] = process.argv.slice(2)
  if (!input || !existsSync(input) || (kind !== "chumreap" && kind !== "salam") || (voice !== "female" && voice !== "male")) {
    console.error("Usage: npx tsx scripts/import-greeting-voice.ts <recording> chumreap|salam [female|male]")
    process.exit(2)
  }
  const ff = ffmpegPath()
  if (spawnSync(ff, ["-version"]).status !== 0) {
    console.error("ffmpeg not found: put it on the PATH, set FFMPEG=<path>, or run `npm i --no-save ffmpeg-static`.")
    process.exit(2)
  }
  const work = mkdtempSync(path.join(tmpdir(), "greeting-import-"))
  try {
    // Mono 24 kHz, the rumble of a phone mic off, then the SoundBox clips' trim.
    const clean = path.join(work, "clean.wav")
    execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ac", "1", "-ar", "24000", "-af", `highpass=f=70,${trimFilter()}`, clean])
    const length = seconds(ff, clean)
    if (length < MIN_SECONDS || length > MAX_SECONDS) throw new Error(`${length.toFixed(1)} s after trimming — a greeting is ${MIN_SECONDS}–${MAX_SECONDS} s`)
    const gain = clipGainDb(volume(ff, clean).mean)
    if (gain === null) throw new Error("silent or far too faint — record closer to the phone, not amplified")
    const dir = path.join(process.cwd(), "public", "audio", "greeting", voice)
    mkdirSync(dir, { recursive: true })
    const out = path.join(dir, `${kind}.mp3`)
    // encodeArgs trims again (nothing left to trim) and applies the gain, the peak limiter and the clips' encoding.
    execFileSync(ff, encodeArgs(clean, out, gain))
    const v = volume(ff, out)
    const ok = clipMatches(v)
    console.log(`${ok ? "✓" : "✗"} ${path.relative(process.cwd(), out)}  ${length.toFixed(2)} s · gain ${gain} dB → mean ${v.mean} dB, peak ${v.peak} dB`)
    if (!ok) {
      console.error("Off the SoundBox clips' loudness — do not commit it; try the recording again.")
      process.exit(1)
    }
    if (voice === "male") console.log("Both male clips in? Set GREETING_MALE_READY = true in src/lib/welcome-greeting.ts.")
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

try {
  main()
} catch (e) {
  // A refused recording says why in one line — never a stack trace.
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
