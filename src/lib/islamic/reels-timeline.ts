/**
 * The short-video engine's pure core (founder, 18/10/2026; docs/reels-video-engine.md): a script (reels-scripts.ts)
 * → a timeline of kinetic-typography cues → the frames → one FFmpeg encode. Khmer is shaped by Skia (the posters'
 * engine), frame by frame — never by FFmpeg's drawtext, which does not shape Khmer subscripts reliably — so FFmpeg only
 * encodes a PNG sequence and the licensed audio into a 9:16 H.264 MP4. Pure and tested (reels-timeline.test.ts).
 */
import { REEL_PLACEHOLDERS, REEL_SECONDS, type ReelAct, type ReelScript } from "@/lib/islamic/reels-scripts"

/** 9:16 vertical, 30 fps. The safe area keeps text clear of the Reels / TikTok buttons and captions. */
export const REEL_FORMAT = {
  width: 1080,
  height: 1920,
  fps: 30,
  safe: { top: 220, bottom: 420, side: 90 },
} as const

/** A line of kinetic typography: it rises in over `enter` seconds at `start` and stays until `end`. */
export type ReelCue = { act: ReelAct; text: string; start: number; end: number; enter: number }

const segmenter = new Intl.Segmenter("km", { granularity: "grapheme" })
/** Seconds a viewer needs to read a line: 0.5 s to notice it, then ~14 Khmer clusters a second; at least 1.2 s. */
export function readingSeconds(text: string): number {
  const clusters = [...segmenter.segment(text)].length
  return Math.max(1.2, Math.round((0.5 + clusters / 14) * 10) / 10)
}

/** The cues of a script: within a beat, the lines appear one after the other, each given its reading time. */
export function reelTimeline(script: ReelScript): ReelCue[] {
  const cues: ReelCue[] = []
  let beatStart = 0
  for (const beat of script.beats) {
    let t = beatStart
    for (const text of beat.onScreen) {
      cues.push({ act: beat.act, text, start: round(t), end: round(beatStart + beat.seconds), enter: 0.35 })
      t += readingSeconds(text)
    }
    beatStart += beat.seconds
  }
  return cues
}
const round = (n: number) => Math.round(n * 100) / 100

/** The rise-in at time `t` (0 → 1, ease-out cubic): opacity and a 40 px upward slide for the frame renderer. */
export function cueProgress(cue: ReelCue, t: number): number {
  if (t < cue.start || t >= cue.end) return 0
  const x = Math.min(1, (t - cue.start) / cue.enter)
  return 1 - (1 - x) ** 3
}

/** Everything that keeps a script from being rendered; empty = ready. */
export function reelProblems(script: ReelScript): string[] {
  const out: string[] = []
  const total = script.beats.reduce((t, b) => t + b.seconds, 0)
  if (total < REEL_SECONDS.min || total > REEL_SECONDS.max) out.push(`length ${total} s (${REEL_SECONDS.min}–${REEL_SECONDS.max} s)`)
  if (script.beats.map((b) => b.act).join(",") !== "hook,turn,resolution") out.push("the three acts: hook, turn, resolution")
  if (!script.beats.at(-1)?.appScreen) out.push("the resolution shows the real app")
  for (const beat of script.beats) {
    const need = beat.onScreen.reduce((t, l) => t + readingSeconds(l), 0)
    if (need > beat.seconds) out.push(`${beat.act}: ${need.toFixed(1)} s of reading in ${beat.seconds} s`)
  }
  return out
}

/** The script with its placeholders filled from the app's own values (`{imsak}` → «០៤:២៣»); a missing one throws. */
export function fillReel(script: ReelScript, values: Partial<Record<(typeof REEL_PLACEHOLDERS)[number], string>>): ReelScript {
  const fill = (s: string) =>
    s.replace(/\{[a-z]+\}/g, (key) => {
      if (!(REEL_PLACEHOLDERS as readonly string[]).includes(key)) return key // «{name}» in an app screen note stays
      const v = values[key as keyof typeof values]
      if (!v) throw new Error(`reel ${script.id}: no value for ${key}`)
      return v
    })
  return { ...script, beats: script.beats.map((b) => ({ ...b, onScreen: b.onScreen.map(fill), voice: b.voice && fill(b.voice) })) }
}

/**
 * The FFmpeg arguments: the rendered PNG sequence (frame-00001.png …) and the audio track → a 9:16 H.264 / AAC MP4
 * that plays everywhere (yuv420p, +faststart for streaming). Without audio, a silent track keeps the platforms happy.
 */
export function ffmpegArgs(o: { framesDir: string; audio: string | null; seconds: number; out: string }): string[] {
  const { fps, width, height } = REEL_FORMAT
  return [
    "-y",
    "-framerate", String(fps),
    "-i", `${o.framesDir}/frame-%05d.png`,
    ...(o.audio ? ["-i", o.audio] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]),
    "-t", String(o.seconds),
    "-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(fps),
    "-c:a", "aac", "-b:a", "160k",
    "-shortest",
    "-movflags", "+faststart",
    o.out,
  ]
}

/** How many frames the renderer draws for a script. */
export const frameCount = (script: ReelScript) => Math.round(script.beats.reduce((t, b) => t + b.seconds, 0) * REEL_FORMAT.fps)
