"use client"

import { announcementText, audioPlan, type SoundboxEvent, type SoundboxLang } from "@/lib/soundbox"

/**
 * The SoundBox's sound: one AudioContext created on the cashier's tap (browsers block audio until a
 * gesture), a cash-register chime synthesised with the Web Audio API (as the prayer chime in
 * prayer-alerts.ts — no audio file), then the amount spoken by the device's voice (Web Speech).
 * A device without a voice for the language plays a short melody instead of staying silent.
 */
let ctx: AudioContext | null = null

export const isUnlocked = () => ctx !== null && ctx.state === "running"

/** On the «🔊 បើកសំឡេង SoundBox» tap: the audio context, and an empty utterance (iOS needs speech started by a tap too). */
export async function unlockAudio(): Promise<boolean> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  ctx ??= new Ctx()
  if (ctx.state !== "running") await ctx.resume().catch(() => null)
  if ("speechSynthesis" in window) {
    const warm = new SpeechSynthesisUtterance(" ")
    warm.volume = 0
    window.speechSynthesis.speak(warm)
  }
  return ctx.state === "running"
}

function tone(freq: number, start: number, length: number, peak: number, type: OscillatorType = "sine") {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

/** «ទីង-ទីង»: a bright cash-register double chime (~0.7 s). Resolves when it has played. */
export function playPaymentChime(): Promise<void> {
  if (!ctx) return Promise.resolve()
  const t = ctx.currentTime + 0.02
  tone(1318.5, t, 0.35, 0.3, "triangle") // E6
  tone(1975.5, t + 0.16, 0.55, 0.25, "triangle") // B6
  tone(2637, t + 0.16, 0.4, 0.06) // a little shimmer
  return new Promise((resolve) => window.setTimeout(resolve, 750))
}

/** The no-voice fallback: a rising four-note melody (~1.2 s). */
export function playMelody(): Promise<void> {
  if (!ctx) return Promise.resolve()
  const t = ctx.currentTime + 0.02
  ;[659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, t + i * 0.18, 0.5, 0.22))
  return new Promise((resolve) => window.setTimeout(resolve, 1_200))
}

/** A voice for the language on this device (voices load late on some browsers). */
export function voiceFor(lang: SoundboxLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang === "km" ? "km" : "en")) ?? null
}

function speak(text: string, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 0.95
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    window.setTimeout(resolve, 8_000)
  })
}

/** One payment: the chime, then the amount (or the melody). Payments arriving together play in turn. */
let queue: Promise<void> = Promise.resolve()
export function announce(e: Pick<SoundboxEvent, "amount" | "currency">, lang: SoundboxLang, soundOn: boolean): Promise<void> {
  queue = queue.then(async () => {
    const voice = voiceFor(lang)
    for (const step of audioPlan({ soundOn, unlocked: isUnlocked(), voice: Boolean(voice) })) {
      if (step === "chime") await playPaymentChime()
      else if (step === "speech" && voice) await speak(announcementText(e, lang), voice)
      else if (step === "melody") await playMelody()
    }
  })
  return queue
}
