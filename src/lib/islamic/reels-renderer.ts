/**
 * The short videos' visual engine — the pure scene (founder, 18/10/2026; docs/reels-video-engine.md): for any moment
 * of a script, what is on the 1080 × 1920 frame, where and how far into its motion. lib/server/reels-frames.ts draws
 * these scenes with Skia (Khmer shaped as on the posters) and streams the frames to FFmpeg with the mixed sound.
 *
 * Layers, back to front: the emerald field with a slowly drifting glow and lattice; the gold mihrab frame; the
 * brand; the beat's prop (the phone binging AI drama, Sophea the Rabbit, the dash to wudu); the kinetic subtitles
 * in sync with the dialogue; the end card with the call to the app; and on every frame of a script the founder has
 * not approved, the DRAFT mark (reelRenderable — a draft is rendered only as a marked preview for the founder).
 * Pure and tested (reels-renderer.test.ts).
 */
import { SOPHEA, type ReelAct, type ReelScript, type ReelSpeaker } from "@/lib/islamic/reels-scripts"
import { cueProgress, REEL_FORMAT, reelTimeline, type ReelCue } from "@/lib/islamic/reels-timeline"

const { width: W, height: H, safe } = REEL_FORMAT

/** The master artwork: the rabbit in a kopiah (public/rabbit-kopiah.png, 1024²) — the app tile, without its label. */
export const SOPHEA_ART = { file: "public/rabbit-kopiah.png", crop: { x: 150, y: 80, w: 725, h: 730 } } as const

/** A live subtitle, oldest first; the renderer stacks them bottom-up in SUBTITLE_BAND, the newest lowest. */
export type SubtitleLayer = { text: string; speaker: ReelSpeaker | "caption"; opacity: number; rise: number; current: boolean }

export type ReelScene = {
  t: number
  act: ReelAct
  /** The field's slow motion: the glow's centre and the lattice's drift (px). */
  glow: { x: number; y: number }
  drift: number
  /** The phone binging AI drama (hook): its episode counter and the scroll of its feed. */
  phone: { x: number; y: number; scale: number; opacity: number; episode: number; scroll: number; shake: number } | null
  /** Sophea the Rabbit: centre, size and her motion (breathing, the pop-in bounce, the shake on the record scratch). */
  sophea: { x: number; y: number; size: number; scale: number; rotate: number; opacity: number } | null
  /** The call to prayer is sounding: the crescent's pulse (0 → 1). */
  adhanPulse: { pulse: number; x: number; y: number; r: number } | null
  /** The dash to wudu: speed lines (0 → 1 → 0). */
  dash: number | null
  subtitles: SubtitleLayer[]
  /** The end card (call to the app, the links): 0 → 1. */
  endCard: number
  /** «DRAFT · មិនទាន់អនុម័ត» on every frame of a script the founder has not approved. */
  draft: boolean
}

export const DRAFT_MARK = "DRAFT · មិនទាន់អនុម័ត"
/** Subtitles live in this band (inside the safe area, under the character); at most `max` blocks at once. */
export const SUBTITLE_BAND = { top: 1060, bottom: H - safe.bottom - 20, gap: 30, max: 2 } as const

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3
/** Overshoot ease (the pop-in bounce). */
const easeOutBack = (x: number) => {
  const c = 1.70158
  const p = clamp(x) - 1
  return 1 + (c + 1) * p ** 3 + c * p ** 2
}

/** The beat at time t and where it started. */
export function beatAt(script: ReelScript, t: number): { index: number; start: number } {
  let start = 0
  for (const [i, b] of script.beats.entries()) {
    if (t < start + b.seconds || i === script.beats.length - 1) return { index: i, start }
    start += b.seconds
  }
  return { index: 0, start: 0 }
}

/**
 * The scene at time t (seconds). `sfxAt` are the comedy cues (reels-audio audioCues) — the record scratch shakes
 * Sophea, the dash starts the speed lines; `adhanFrom` is when the call to prayer begins.
 */
export function sceneAt(script: ReelScript, t: number, o: { approved: boolean; sfxAt?: { id: string; at: number }[]; adhanFrom?: number | null; cues?: ReelCue[] }): ReelScene {
  const cues = o.cues ?? reelTimeline(script)
  const { index, start } = beatAt(script, t)
  const beat = script.beats[index]
  const local = t - start
  const sfx = (id: string) => o.sfxAt?.find((s) => s.id === id)?.at ?? null

  // The phone (the hook): the feed scrolls, the episode counter climbs; it shakes when the call to prayer starts.
  const phone =
    beat.act === "hook"
      ? {
          x: W / 2,
          y: 800,
          scale: 1 + 0.02 * Math.sin(t * 2.4),
          opacity: 1 - clamp((local - (beat.seconds - 0.4)) / 0.4),
          episode: 36 + Math.min(2, Math.floor(local / 1.6)),
          scroll: (local * 340) % 420,
          shake: o.adhanFrom != null && t >= o.adhanFrom && t < o.adhanFrom + 0.6 ? Math.sin((t - o.adhanFrom) * 60) * 10 * (1 - (t - o.adhanFrom) / 0.6) : 0,
        }
      : null

  // Sophea pops in at the turn (bounce), breathes, shakes on the record scratch; smaller on the end card.
  let sophea: ReelScene["sophea"] = null
  if (beat.act !== "hook") {
    const pop = beat.act === "turn" ? easeOutBack(local / 0.55) : 1
    const breathe = 1 + 0.025 * Math.sin(t * Math.PI * 0.7)
    const scratch = sfx("record_scratch")
    const shake = scratch != null && t >= scratch && t < scratch + 0.45 ? Math.sin((t - scratch) * 70) * 0.06 * (1 - (t - scratch) / 0.45) : 0
    const end = beat.act === "resolution" ? easeOut((local - 0.2) / 0.8) : 0
    sophea = {
      x: W / 2,
      y: 740 - end * 210,
      size: 560 - end * 180,
      scale: Math.max(0, pop) * breathe,
      rotate: shake,
      opacity: clamp(local / 0.25 + (beat.act === "resolution" ? 1 : 0)),
    }
  }

  // The crescent beside the phone in the hook; at the frame's edge once Sophea takes the stage.
  const pulse = 0.5 + 0.5 * Math.sin(((t - (o.adhanFrom ?? 0)) * Math.PI * 1.6))
  const adhan =
    o.adhanFrom != null && t >= o.adhanFrom && beat.act !== "resolution"
      ? beat.act === "hook"
        ? { pulse, x: 880, y: 520, r: 40 }
        : { pulse, x: 950, y: 480, r: 30 }
      : null
  const dashAt = sfx("cartoon_dash")
  const dash = dashAt != null && t >= dashAt && t < dashAt + 1.1 ? Math.sin(((t - dashAt) / 1.1) * Math.PI) : null

  return {
    t,
    act: beat.act,
    glow: { x: W / 2 + 160 * Math.sin(t * 0.35), y: H * 0.36 + 120 * Math.cos(t * 0.27) },
    drift: (t * 9) % 135,
    phone,
    sophea,
    adhanPulse: adhan,
    dash,
    subtitles: subtitleLayers(script, cues, t),
    endCard: beat.act === "resolution" ? easeOut((local - 0.15) / 0.6) : 0,
    draft: !o.approved,
  }
}

/**
 * The beat's lines that have started, stacked bottom-up in the subtitle band: the newest at full strength, rising
 * in; the earlier ones of the same beat dimmed above it. Speaker = the beat's (the resolution's lines are captions).
 */
export function subtitleLayers(script: ReelScript, cues: ReelCue[], t: number): SubtitleLayer[] {
  const live = cues.filter((c) => t >= c.start && t < c.end)
  const beatOf = (c: ReelCue) => script.beats.find((b) => b.act === c.act)
  return live.map((c, i) => {
    const fromBottom = live.length - 1 - i
    const speaker = beatOf(c)?.speaker ?? "caption"
    return {
      text: c.text,
      speaker,
      // A caption (the end card's lines) stays at full strength; earlier dialogue dims.
      opacity: fromBottom === 0 ? cueProgress(c, t) : speaker === "caption" ? 1 : 0.55,
      rise: (1 - cueProgress(c, t)) * 40,
      current: fromBottom === 0,
    }
  })
}

/** The colours of a speaker's subtitle: Sophea gold, the viewer white on a dark pill, captions soft white. */
export const SUBTITLE_STYLE: Record<SubtitleLayer["speaker"], { color: string; pill: string | null; label: string | null }> = {
  sophea: { color: "#fcd34d", pill: "rgba(2,44,34,0.72)", label: SOPHEA.km },
  user: { color: "#ffffff", pill: "rgba(0,0,0,0.55)", label: null },
  narrator: { color: "#ecfdf5", pill: null, label: null },
  caption: { color: "#ecfdf5", pill: null, label: null },
}

/** Frame times for a script at the format's frame rate: 0, 1/30, … (the renderer's loop). */
export function frameTimes(script: ReelScript): number[] {
  const total = script.beats.reduce((s, b) => s + b.seconds, 0)
  const n = Math.round(total * REEL_FORMAT.fps)
  return Array.from({ length: n }, (_, i) => i / REEL_FORMAT.fps)
}
