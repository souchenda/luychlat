/**
 * The short videos' sound (founder, 18/10/2026; docs/reels-video-engine.md): Khmer neural text-to-speech for the
 * voices (Azure AI Speech only — the licensed service; never Edge-TTS or another unofficial endpoint, CLAUDE.md
 * Licensing), the comedy sound effects synthesized in-house (public/audio/sfx, scripts/reels-sfx.sh), the app's
 * CC0 Adhan as the ambient track, and one FFmpeg filtergraph that mixes them. Pure: the SSML, the cue times and the
 * FFmpeg arguments; the Azure call is lib/server/reels-tts.ts. Tested in reels-audio.test.ts.
 */
import * as G from "@/lib/islamic/glossary"
import type { ReelScript, ReelSpeaker } from "@/lib/islamic/reels-scripts"
import { reelTimeline } from "@/lib/islamic/reels-timeline"

// ─── Voices ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Azure's Khmer neural voices per character. Sophea speaks with km-KH-PisethNeural, the founder's choice
 * (18/10/2026 — Piseth is Azure's male Khmer voice; km-KH-SreymomNeural is the female one); the viewer and the
 * narrator with Sreymom, so the two characters never sound alike.
 */
export const REEL_VOICES: Record<ReelSpeaker, string> = {
  sophea: "km-KH-PisethNeural",
  user: "km-KH-SreymomNeural",
  narrator: "km-KH-SreymomNeural",
}

/** Natural and lively (founder: 1.05× and a lively pitch); the dramatic pauses come from the punctuation. */
export const REEL_PROSODY = { rate: "+5%", pitch: "+4%" } as const

/** Pauses after punctuation, in milliseconds: the deadpan timing lives in these silences. «·» is not read aloud. */
export const REEL_PAUSES: { mark: RegExp; ms: number; keep: boolean }[] = [
  { mark: /\.\.\.|…/g, ms: 550, keep: true },
  { mark: /!/g, ms: 320, keep: true },
  { mark: /\?/g, ms: 320, keep: true },
  { mark: / · /g, ms: 250, keep: false },
]

/**
 * How the voice reads the Islamic words. `alias` (an SSML <sub>) only once the founder has heard a sample and found
 * a word misread — never a guess; `null` = Azure reads the word as written. scripts/reels-tts-sample.mjs speaks every
 * word on the Droplet for the founder to listen to.
 */
export const REEL_LEXICON: { term: string; alias: string | null; note: string }[] = [
  { term: G.SEMBAHYANG, alias: null, note: "to the prayer (Cham / Malay sembahyang)" },
  { term: G.WUDU, alias: null, note: "to make wudu" },
  { term: G.ADHAN, alias: null, note: "the call to prayer" },
  { term: G.SAHUR, alias: null, note: "the pre-dawn meal" },
]

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** One voice line as SSML for Azure: the character's voice, the prosody, the lexicon and the pauses. */
export function reelSsml(line: string, speaker: ReelSpeaker, lexicon = REEL_LEXICON): string {
  let body = xml(line)
  for (const { term, alias } of lexicon) if (alias) body = body.split(term).join(`<sub alias="${xml(alias)}">${term}</sub>`)
  for (const { mark, ms, keep } of REEL_PAUSES) body = body.replace(mark, (m) => (keep ? `${m}<break time="${ms}ms"/>` : ` <break time="${ms}ms"/> `))
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="km-KH">`,
    `<voice name="${REEL_VOICES[speaker]}">`,
    `<prosody rate="${REEL_PROSODY.rate}" pitch="${REEL_PROSODY.pitch}">${body}</prosody>`,
    `</voice></speak>`,
  ].join("")
}

/**
 * A voice clip must end before its beat does (with 0.3 s of air). When the synthesized clip is too long, the rate
 * that would fit (Azure prosody, at most +20% — faster stops sounding natural); null = rewrite the line instead.
 */
export function voiceRateFor(clipSeconds: number, beatSeconds: number, startOffset = VOICE_OFFSET): string | null {
  const room = beatSeconds - startOffset - 0.3
  if (clipSeconds <= room) return REEL_PROSODY.rate
  const speedup = clipSeconds / room // relative to the clip as synthesized at +5%
  const pct = Math.ceil((1.05 * speedup - 1) * 100)
  return pct <= 20 ? `+${pct}%` : null
}

// ─── Sound effects and the ambient track ─────────────────────────────────────────────────────────

/** In-house comedy effects (synthesized by scripts/reels-sfx.sh with FFmpeg — ours, no licence needed). */
export const REEL_SFX = {
  record_scratch: { file: "public/audio/sfx/record_scratch.mp3", volume: 0.8, use: "Sophea catches the binge" },
  dramatic_thud: { file: "public/audio/sfx/dramatic_thud.mp3", volume: 0.9, use: "the deadpan punchline" },
  cartoon_dash: { file: "public/audio/sfx/cartoon_dash.mp3", volume: 0.7, use: `running to ${G.WUDU}` },
  pop_chime: { file: "public/audio/sfx/pop_chime.mp3", volume: 0.6, use: "the closing call to the app" },
} as const
export type SfxId = keyof typeof REEL_SFX

/** The ambient Adhan: the app's CC0 recording (public/adhan, README.txt), always under the voices. */
export const REEL_AMBIENT = { adhan: "public/adhan/commons-cc0-short.mp3" } as const
/**
 * The founder's mix: voices 1.0, the ambient 0.15 under them. Each voice clip is first brought to −16 LUFS (the
 * loudness of social video), so the voice is crisp and loud whatever level the speech service returns.
 */
export const REEL_MIX = { voice: 1.0, ambient: 0.15, ambientFadeOut: 1.5, voiceLoudness: "loudnorm=I=-16:TP=-1.5:LRA=11" } as const
/** A voice starts this long after its beat begins (the cut lands first, then the line). */
export const VOICE_OFFSET = 0.25

/** What sounds when, in seconds from the start of the video. */
export type AudioCue =
  | { kind: "voice"; beat: number; speaker: ReelSpeaker; text: string; at: number }
  | { kind: "sfx"; id: SfxId; at: number }
  | { kind: "ambient"; file: string; at: number }

/** The script's sound cues: each voice at its beat (+0.25 s), each effect at its beat offset, the Adhan where it begins. */
export function audioCues(script: ReelScript): AudioCue[] {
  const cues: AudioCue[] = []
  const lines = reelTimeline(script)
  let start = 0
  script.beats.forEach((b, i) => {
    if (b.voice && b.speaker) cues.push({ kind: "voice", beat: i, speaker: b.speaker, text: b.voice, at: round(start + VOICE_OFFSET) })
    const beatLines = lines.filter((c) => c.act === b.act && c.end === round(start + b.seconds))
    for (const s of b.sfx ?? []) {
      const at = "at" in s ? start + s.at : beatLines[s.withLine]?.start
      if (at === undefined) throw new Error(`reel ${script.id}: ${s.id} on line ${"withLine" in s ? s.withLine : "?"} of ${b.act}, which has ${beatLines.length}`)
      cues.push({ kind: "sfx", id: s.id, at: round(at) })
    }
    if (b.ambient) cues.push({ kind: "ambient", file: REEL_AMBIENT[b.ambient.track], at: round(start + b.ambient.at) })
    start += b.seconds
  })
  return cues.sort((a, b) => a.at - b.at)
}
const round = (n: number) => Math.round(n * 100) / 100
const ms = (s: number) => Math.round(s * 1000)

/**
 * The FFmpeg mix: every input delayed to its cue (adelay), at its level (volume), the ambient faded out at the end,
 * summed without renormalising (amix normalize=0, so the voice stays at 1.0), padded with silence and cut at exactly
 * the video's length (-t), and limited against clipping — 48 kHz stereo AAC for the MP4.
 */
export function mixArgs(o: { voices: { file: string; at: number }[]; ambient: { file: string; at: number } | null; sfx: { file: string; at: number; volume: number }[]; seconds: number; out: string }): string[] {
  const inputs: string[] = []
  const chains: string[] = []
  const labels: string[] = []
  const add = (file: string, at: number, volume: number, label: string, extra = "", before = "") => {
    const n = inputs.length / 2
    inputs.push("-i", file)
    chains.push(`[${n}:a]${before}aresample=48000,adelay=delays=${ms(at)}:all=1,volume=${volume}${extra}[${label}]`)
    labels.push(`[${label}]`)
  }
  o.voices.forEach((v, i) => add(v.file, v.at, REEL_MIX.voice, `v${i}`, "", `${REEL_MIX.voiceLoudness},`))
  if (o.ambient) add(o.ambient.file, o.ambient.at, REEL_MIX.ambient, "bg", `,afade=t=out:st=${o.seconds - REEL_MIX.ambientFadeOut}:d=${REEL_MIX.ambientFadeOut}`)
  o.sfx.forEach((s, i) => add(s.file, s.at, s.volume, `s${i}`))
  const graph = [
    ...chains,
    `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,aformat=sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95[mix]`,
  ].join(";")
  return ["-y", ...inputs, "-filter_complex", graph, "-map", "[mix]", "-t", String(o.seconds), "-c:a", "aac", "-b:a", "192k", o.out]
}

/** The mix plan of a script, given the synthesized voice files (one per voice cue, in order) and a root path. */
export function scriptMixArgs(script: ReelScript, voiceFiles: string[], root: string, out: string): string[] {
  const cues = audioCues(script)
  const voices = cues.filter((c) => c.kind === "voice")
  if (voices.length !== voiceFiles.length) throw new Error(`reel ${script.id}: ${voices.length} voice lines, ${voiceFiles.length} files`)
  const ambient = cues.find((c) => c.kind === "ambient")
  return mixArgs({
    voices: voices.map((v, i) => ({ file: voiceFiles[i], at: v.at })),
    ambient: ambient && ambient.kind === "ambient" ? { file: `${root}/${ambient.file}`, at: ambient.at } : null,
    sfx: cues.flatMap((c) => (c.kind === "sfx" ? [{ file: `${root}/${REEL_SFX[c.id].file}`, at: c.at, volume: REEL_SFX[c.id].volume }] : [])),
    seconds: script.beats.reduce((t, b) => t + b.seconds, 0),
    out,
  })
}
