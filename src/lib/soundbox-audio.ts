"use client"

import { announcementText, audioPlan, KHMER_CLIPS, khmerClipSequence, voiceAvailability, VOICE_TAGS, type KhmerClip, type SoundboxEvent, type SoundboxMode, type VoiceLang } from "@/lib/soundbox"

/**
 * The SoundBox's sound: one AudioContext created on the cashier's tap (browsers block audio until a
 * gesture), a cash-register chime synthesised with the Web Audio API (as the prayer chime in
 * prayer-alerts.ts — no audio file), then the amount spoken. English and Chinese use the device's
 * voices (Web Speech). Khmer is joined from recorded clips (public/audio/soundbox/khmer/*.mp3) —
 * iPhones ship no Khmer voice — else a device Khmer voice, else English; no voice at all → a short
 * melody instead of silence.
 */
let ctx: AudioContext | null = null

/**
 * The SoundBox touches the phone's audio ONLY while it announces a payment (founder, 14/10/2026 — an
 * always-on silent loop + Media Session held the iPhone's audio session and muted Telegram voice notes
 * and system sounds while the app was open). The context is unlocked by a tap, then suspended — the
 * audio session released — and resumed just for each announcement.
 */
let unlocked = false
export const isUnlocked = () => ctx !== null && unlocked
const release = () => {
  if (ctx && ctx.state === "running") void ctx.suspend().catch(() => null)
}

const CLIP_BASE = "/audio/soundbox/khmer"
const clips = new Map<KhmerClip, AudioBuffer>()
let clipsLoading: Promise<boolean> | null = null

/** All 27 Khmer clips decoded once (a few KB each); false — and Khmer falls back — when any is missing. */
function loadKhmerClips(): Promise<boolean> {
  if (!ctx) return Promise.resolve(false)
  const audio = ctx
  clipsLoading ??= Promise.all(
    KHMER_CLIPS.map(async (name) => {
      const res = await fetch(`${CLIP_BASE}/${name}.mp3`, { cache: "force-cache" })
      if (!res.ok) throw new Error(name)
      clips.set(name, await audio.decodeAudioData(await res.arrayBuffer()))
    }),
  ).then(
    () => true,
    () => {
      clips.clear()
      return false
    },
  )
  return clipsLoading
}

export const khmerClipsReady = () => clips.size === KHMER_CLIPS.length

/** The clips back to back, sample-accurate on the audio clock (no gaps from starting files one by one). */
function playKhmerClips(sequence: KhmerClip[], volume: number): Promise<void> {
  if (!ctx || !khmerClipsReady()) return Promise.resolve()
  const gain = ctx.createGain()
  gain.gain.value = Math.min(1, Math.max(0, volume))
  gain.connect(ctx.destination)
  let at = ctx.currentTime + 0.05
  for (const name of sequence) {
    const buffer = clips.get(name)!
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.start(at)
    at += buffer.duration
  }
  const ms = (at - ctx.currentTime) * 1000 + 150
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Android Chrome fills its voice list a moment after the page loads (getVoices() is empty until
 * «voiceschanged»): an announcement made before that found no Khmer voice and fell back to English.
 * Wait for the list (at most 1.5 s) before choosing a voice.
 */
function voicesReady(timeoutMs = 1_500): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || window.speechSynthesis.getVoices().length) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done)
      resolve()
    }
    window.speechSynthesis.addEventListener("voiceschanged", done)
    window.setTimeout(done, timeoutMs)
  })
}

/** On the «🔊 បើកសំឡេង SoundBox» tap (or the first tap after a reload): the audio context, the Khmer clips, and an empty utterance (iOS needs speech started by a tap too) — then the audio is released until a payment. */
export async function unlockAudio(): Promise<boolean> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  ctx ??= new Ctx()
  if (ctx.state !== "running") await ctx.resume().catch(() => null)
  if (ctx.state === "running") unlocked = true
  void loadKhmerClips()
  void voicesReady()
  if ("speechSynthesis" in window) {
    const warm = new SpeechSynthesisUtterance(" ")
    warm.volume = 0
    window.speechSynthesis.speak(warm)
  }
  const ok = ctx.state === "running"
  // Nothing plays until a payment: give the audio back to the phone (Telegram, calls, music…).
  release()
  return ok
}

function tone(freq: number, start: number, length: number, peak: number, volume: number, type: OscillatorType = "sine") {
  if (!ctx || volume <= 0) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * volume), start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

/** «ទីង-ទីង»: a bright cash-register double chime (~0.7 s). Resolves when it has played. */
export function playPaymentChime(volume = 1): Promise<void> {
  if (!ctx) return Promise.resolve()
  const t = ctx.currentTime + 0.02
  tone(1318.5, t, 0.35, 0.3, volume, "triangle") // E6
  tone(1975.5, t + 0.16, 0.55, 0.25, volume, "triangle") // B6
  tone(2637, t + 0.16, 0.4, 0.06, volume) // a little shimmer
  return new Promise((resolve) => window.setTimeout(resolve, 750))
}

/** The no-voice fallback: a rising four-note melody (~1.2 s). */
export function playMelody(volume = 1): Promise<void> {
  if (!ctx) return Promise.resolve()
  const t = ctx.currentTime + 0.02
  ;[659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, t + i * 0.18, 0.5, 0.22, volume))
  return new Promise((resolve) => window.setTimeout(resolve, 1_200))
}

/** A voice for the language on this device ("km-KH", "en-US", "zh-CN" — or any of that language; voices load late on some browsers). */
export function voiceFor(lang: VoiceLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null
  const voices = window.speechSynthesis.getVoices()
  const tag = VOICE_TAGS[lang].toLowerCase()
  const base = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-")
  return voices.find((v) => base(v) === tag) ?? voices.find((v) => base(v).startsWith(lang) || (lang === "zh" && base(v).startsWith("cmn"))) ?? null
}

/**
 * Which languages to try (voiceAvailability): Android Chrome often reports no voices at all although
 * the phone speaks with its default one — then every language is tried and a failure falls back at
 * play time. Khmer also counts with the recorded clips.
 */
export const availableVoices = (): Record<VoiceLang, boolean> =>
  voiceAvailability({
    speech: typeof window !== "undefined" && "speechSynthesis" in window,
    listed: typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices().map((v) => v.lang) : [],
    khmerClips: khmerClipsReady(),
  })

/**
 * Speaks `text` in `lang`: the matching voice when the phone lists one, else just the language tag
 * (the phone's default voice for it). Resolves true once speech really started and ended; false when
 * it errored or never started within 3 s (Android Chrome can leave the queue stuck after other audio —
 * cancel() + resume() first clears that).
 */
function speak(text: string, lang: VoiceLang, volume: number): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    let started = false
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      synth.cancel()
      synth.resume()
    } catch {
      // not supported here: speak anyway
    }
    const u = new SpeechSynthesisUtterance(text)
    const voice = voiceFor(lang)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? VOICE_TAGS[lang]
    u.rate = 0.95
    u.volume = Math.min(1, Math.max(0, volume))
    u.onstart = () => {
      started = true
    }
    u.onend = () => finish(started)
    u.onerror = (ev) => {
      console.error(`[soundbox] speech (${u.lang}) failed:`, ev.error)
      finish(false)
    }
    synth.speak(u)
    // Never started (no voice for the language, a stuck engine) → a fallback, not silence.
    window.setTimeout(() => {
      if (!started) {
        synth.cancel()
        finish(false)
      }
    }, 3_000)
    window.setTimeout(() => finish(started), 12_000)
  })
}

export type AnnounceResult = "played" | "muted" | "locked" | "error"

/**
 * One payment: the chime, then each language of the mode (or the melody). Payments arriving together
 * play in turn. Never silently skipped: «locked» when the phone holds the audio (never unlocked, or
 * iOS suspended it after the screen locked — one tap brings it back), «error» with the reason logged.
 */
let queue: Promise<unknown> = Promise.resolve()
export function announce(e: Pick<SoundboxEvent, "amount" | "currency">, mode: SoundboxMode, soundOn: boolean, volume = 1): Promise<AnnounceResult> {
  const run = queue.then(async (): Promise<AnnounceResult> => {
    if (!soundOn) return "muted"
    if (!ctx) return "locked"
    if (ctx.state !== "running") await ctx.resume().catch(() => null)
    if (ctx.state !== "running") {
      console.error("[soundbox] audio is suspended by the browser:", ctx.state)
      return "locked"
    }
    try {
      // The clips load on the unlock tap; a payment right after it waits for them (a second at most).
      if (mode.startsWith("km") && !khmerClipsReady()) await Promise.race([loadKhmerClips(), new Promise((r) => window.setTimeout(r, 1_500))])
      await voicesReady()
      for (const step of audioPlan({ soundOn, unlocked: true, mode, voices: availableVoices() })) {
        if (step === "chime") await playPaymentChime(volume)
        else if (step === "melody") await playMelody(volume)
        else {
          const lang = step.slice("speech:".length) as VoiceLang
          // Khmer: the recorded clips first (they sound the same on every phone).
          if (lang === "km" && khmerClipsReady()) {
            await playKhmerClips(khmerClipSequence(e.amount, e.currency), volume)
            continue
          }
          // Spoken; a language the phone can't say → English (for Khmer), else the melody — never silence.
          if (await speak(announcementText(e, lang), lang, volume)) continue
          if (lang !== "en" && (await speak(announcementText(e, "en"), "en", volume))) continue
          await playMelody(volume)
        }
      }
      return "played"
    } catch (error) {
      console.error("[soundbox] announcement failed:", error)
      return "error"
    } finally {
      // Announced: the phone's audio is released again at once.
      release()
    }
  })
  queue = run
  return run
}
