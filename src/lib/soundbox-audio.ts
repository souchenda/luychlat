"use client"

import { announcementText, audioPlan, KHMER_CLIPS, khmerClipSequence, VOICE_TAGS, type KhmerClip, type SoundboxEvent, type SoundboxMode, type VoiceLang } from "@/lib/soundbox"

/**
 * The SoundBox's sound: one AudioContext created on the cashier's tap (browsers block audio until a
 * gesture), a cash-register chime synthesised with the Web Audio API (as the prayer chime in
 * prayer-alerts.ts — no audio file), then the amount spoken. English and Chinese use the device's
 * voices (Web Speech). Khmer is joined from recorded clips (public/audio/soundbox/khmer/*.mp3) —
 * iPhones ship no Khmer voice — else a device Khmer voice, else English; no voice at all → a short
 * melody instead of silence.
 */
let ctx: AudioContext | null = null

export const isUnlocked = () => ctx !== null && ctx.state === "running"

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

/** On the «🔊 បើកសំឡេង SoundBox» tap: the audio context, the Khmer clips, and an empty utterance (iOS needs speech started by a tap too). */
export async function unlockAudio(): Promise<boolean> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  ctx ??= new Ctx()
  if (ctx.state !== "running") await ctx.resume().catch(() => null)
  void loadKhmerClips()
  if ("speechSynthesis" in window) {
    const warm = new SpeechSynthesisUtterance(" ")
    warm.volume = 0
    window.speechSynthesis.speak(warm)
  }
  return ctx.state === "running"
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

/** Khmer counts as available with the recorded clips (every device) or a device Khmer voice. */
export const availableVoices = (): Record<VoiceLang, boolean> => ({ km: khmerClipsReady() || Boolean(voiceFor("km")), en: Boolean(voiceFor("en")), zh: Boolean(voiceFor("zh")) })

function speak(text: string, voice: SpeechSynthesisVoice, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.95
    u.volume = Math.min(1, Math.max(0, volume))
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
    window.setTimeout(resolve, 8_000)
  })
}

/** One payment: the chime, then each language of the mode (or the melody). Payments arriving together play in turn. */
let queue: Promise<void> = Promise.resolve()
export function announce(e: Pick<SoundboxEvent, "amount" | "currency">, mode: SoundboxMode, soundOn: boolean, volume = 1): Promise<void> {
  queue = queue.then(async () => {
    // The clips load on the unlock tap; a payment right after it waits for them (a second at most).
    if (mode.startsWith("km") && ctx && !khmerClipsReady()) await Promise.race([loadKhmerClips(), new Promise((r) => window.setTimeout(r, 1_500))])
    for (const step of audioPlan({ soundOn, unlocked: isUnlocked(), mode, voices: availableVoices() })) {
      if (step === "chime") await playPaymentChime(volume)
      else if (step === "melody") await playMelody(volume)
      else {
        const lang = step.slice("speech:".length) as VoiceLang
        // Khmer: the recorded clips first (they sound the same on every phone).
        if (lang === "km" && khmerClipsReady()) {
          await playKhmerClips(khmerClipSequence(e.amount, e.currency), volume)
          continue
        }
        const voice = voiceFor(lang)
        if (voice) await speak(announcementText(e, lang), voice, volume)
      }
    }
  })
  return queue
}
