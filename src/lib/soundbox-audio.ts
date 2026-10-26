"use client"

import { announcementText, audioPlan, DEFAULT_VOICE_GENDER, DEFAULT_VOICE_SPEED, KHMER_CLIPS, khmerClipSequence, khmerClipUrl, playedVoice, voiceAvailability, VOICE_TAGS, type KhmerClip, type SoundboxEvent, type SoundboxMode, type VoiceGender, type VoiceLang, type VoiceSpeed } from "@/lib/soundbox"

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

/**
 * One decoded set of the 27 clips per voice and speed (Task #465 — the faster sets are rendered ahead, pitch kept; Task #509
 * — 👩 / 👨, keyed by the voice that really plays, so male-before-its-clips shares the female set).
 */
const clipSets = new Map<string, Map<KhmerClip, AudioBuffer>>()
const clipsLoading = new Map<string, Promise<boolean>>()
const setKey = (speed: VoiceSpeed, gender: VoiceGender) => `${playedVoice(gender)}:${speed}`

/** All 27 Khmer clips of a speed decoded once (a few KB each); false — and Khmer falls back — when any is missing. */
function loadKhmerClips(speed: VoiceSpeed, gender: VoiceGender): Promise<boolean> {
  if (!ctx) return Promise.resolve(false)
  const audio = ctx
  const key = setKey(speed, gender)
  const pending = clipsLoading.get(key)
  if (pending) return pending
  const set = new Map<KhmerClip, AudioBuffer>()
  const loading = Promise.all(
    KHMER_CLIPS.map(async (name) => {
      const res = await fetch(khmerClipUrl(name, speed, gender), { cache: "force-cache" })
      if (!res.ok) throw new Error(name)
      set.set(name, await audio.decodeAudioData(await res.arrayBuffer()))
    }),
  ).then(
    () => {
      clipSets.set(key, set)
      return true
    },
    () => false,
  )
  clipsLoading.set(key, loading)
  return loading
}

export const khmerClipsReady = (speed: VoiceSpeed = DEFAULT_VOICE_SPEED, gender: VoiceGender = DEFAULT_VOICE_GENDER) => clipSets.get(setKey(speed, gender))?.size === KHMER_CLIPS.length

/**
 * The clips back to back, sample-accurate on the audio clock (no gaps from starting files one by one); the
 * clips are trimmed of their silence (Task #465), so the words run on like a bank soundbox's.
 */
function playKhmerClips(sequence: KhmerClip[], volume: number, speed: VoiceSpeed, gender: VoiceGender): Promise<void> {
  const clips = clipSets.get(setKey(speed, gender))
  if (!ctx || !clips || clips.size !== KHMER_CLIPS.length) return Promise.resolve()
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
export async function unlockAudio(speed: VoiceSpeed = DEFAULT_VOICE_SPEED, gender: VoiceGender = DEFAULT_VOICE_GENDER): Promise<boolean> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  ctx ??= new Ctx()
  // Speech first, synchronously inside the tap: iOS lets a page speak on its own later only if it spoke
  // DURING a touch — primed after an await (as before, 14/10/2026) the touch no longer counted and
  // every payment chimed without words.
  warmSpeech()
  if (ctx.state !== "running") await ctx.resume().catch(() => null)
  if (ctx.state === "running") unlocked = true
  void loadKhmerClips(speed, gender)
  void voicesReady()
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
    khmerClips: [...clipSets.values()].some((set) => set.size === KHMER_CLIPS.length),
  })

export type SpeechOutcome = "spoken" | "timeout" | "silent-end" | `error:${string}`

/**
 * One attempt at speaking `text` in `lang`: the matching voice when the phone lists one, else just the
 * language tag (the phone's default voice for it). The engine is cancelled ONLY when something is
 * still speaking — cancel() right before speak() makes Safari and Chrome drop the new utterance
 * (founder, 14/10/2026: the 13:38 payment chimed, then nothing).
 */
const speaking = new Set<SpeechSynthesisUtterance>()

function speakOnce(text: string, lang: VoiceLang, volume: number, speed: VoiceSpeed): Promise<SpeechOutcome> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    let started = false
    let settled = false
    const finish = (r: SpeechOutcome) => {
      if (settled) return
      settled = true
      speaking.delete(u)
      resolve(r)
    }
    try {
      if (synth.speaking || synth.pending) synth.cancel()
      if (synth.paused) synth.resume()
    } catch {
      // not supported here: speak anyway
    }
    const u = new SpeechSynthesisUtterance(text)
    // Held until it ends: a collected utterance loses its events (a known Safari / Chrome bug).
    speaking.add(u)
    const voice = voiceFor(lang)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? VOICE_TAGS[lang]
    u.rate = speed
    u.volume = Math.min(1, Math.max(0, volume))
    u.onstart = () => {
      started = true
    }
    u.onend = () => finish(started ? "spoken" : "silent-end")
    u.onerror = (ev) => {
      console.error(`[soundbox] speech (${u.lang}) failed:`, ev.error)
      finish(`error:${ev.error}`)
    }
    synth.speak(u)
    // Never started (no voice for the language, a stuck engine, speech not allowed yet) → a fallback, not silence.
    window.setTimeout(() => {
      if (!started) {
        if (synth.speaking || synth.pending) synth.cancel()
        finish("timeout")
      }
    }, 3_000)
    window.setTimeout(() => finish(started ? "spoken" : "timeout"), 12_000)
  })
}

/**
 * Speech not yet proven on this page (none spoken yet, or the last attempt failed): every touch primes it
 * again (speechNeedsTap → warmSpeech in the tap) until an announcement is really spoken.
 */
let speechUnproven = true
export const speechNeedsTap = () => speechUnproven

/** Speaks, with one retry after a stuck engine or an interruption; each attempt is written to `log`. */
async function speak(text: string, lang: VoiceLang, volume: number, speed: VoiceSpeed, log: string[]): Promise<boolean> {
  let r = await speakOnce(text, lang, volume, speed)
  log.push(`${lang}:${r}`)
  if (r === "spoken") {
    speechUnproven = false
    return true
  }
  speechUnproven = true
  if (r === "error:not-allowed") return false
  await new Promise((resolve) => window.setTimeout(resolve, 250))
  r = await speakOnce(text, lang, volume, speed)
  log.push(`${lang}:retry:${r}`)
  if (r === "spoken") speechUnproven = false
  return r === "spoken"
}

/**
 * Speech unlocked by a touch: iOS (and Chrome) let a page speak on its own only after it spoke once
 * inside a tap — a real, silent utterance (an empty or blank one is skipped and unlocks nothing).
 */
export function warmSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return
  try {
    if (window.speechSynthesis.speaking) return
    const warm = new SpeechSynthesisUtterance(".")
    warm.volume = 0
    warm.rate = 2
    speaking.add(warm)
    warm.onend = warm.onerror = () => {
      speaking.delete(warm)
    }
    window.speechSynthesis.speak(warm)
  } catch {
    // no speech here: Khmer clips / the melody still play
  }
}

/** Web Audio back on (after the context was suspended for speech). */
async function audible() {
  if (ctx && ctx.state !== "running") await ctx.resume().catch(() => null)
}

export type AnnounceResult = "played" | "muted" | "locked" | "error"

/**
 * One payment: the chime, then each language of the mode (or the melody). Payments arriving together
 * play in turn. Never silently skipped: «locked» when the phone holds the audio (never unlocked, or
 * iOS suspended it after the screen locked — one tap brings it back), «error» with the reason logged.
 */
let queue: Promise<unknown> = Promise.resolve()
export type Announced = { result: AnnounceResult; log: string[] }
/** The chime at 1.0x, then the amount at the chosen voice speed (Task #465 — 1.2x by default). */
export function announce(e: Pick<SoundboxEvent, "amount" | "currency">, mode: SoundboxMode, soundOn: boolean, volume = 1, speed: VoiceSpeed = DEFAULT_VOICE_SPEED, gender: VoiceGender = DEFAULT_VOICE_GENDER): Promise<Announced> {
  const run = queue.then(async (): Promise<Announced> => {
    // What happened, step by step — reported with the payment, so a silent announcement is never a guess.
    const log: string[] = [document.visibilityState]
    const done = (result: AnnounceResult): Announced => ({ result, log })
    if (!soundOn) return done("muted")
    if (!ctx) return done("locked")
    if (ctx.state !== "running") await ctx.resume().catch(() => null)
    if (ctx.state !== "running") {
      console.error("[soundbox] audio is suspended by the browser:", ctx.state)
      log.push(`ctx:${ctx.state}`)
      return done("locked")
    }
    try {
      // The clips load on the unlock tap; a payment right after it waits for them (a second at most).
      if (mode.startsWith("km") && !khmerClipsReady(speed, gender)) await Promise.race([loadKhmerClips(speed, gender), new Promise((r) => window.setTimeout(r, 1_500))])
      await voicesReady()
      for (const step of audioPlan({ soundOn, unlocked: true, mode, voices: availableVoices() })) {
        if (step === "chime" || step === "melody") log.push(step)
        if (step === "chime") {
          await playPaymentChime(volume)
          // The chime has finished: the Web Audio context lets go of the audio session before the
          // words, so iOS never has the two compete (speech is not Web Audio).
          if (ctx.state === "running") await ctx.suspend().catch(() => null)
        } else if (step === "melody") {
          await audible()
          await playMelody(volume)
        } else {
          const lang = step.slice("speech:".length) as VoiceLang
          // Khmer: the recorded clips first (they sound the same on every phone).
          if (lang === "km" && khmerClipsReady(speed, gender)) {
            await audible()
            await playKhmerClips(khmerClipSequence(e.amount, e.currency), volume, speed, gender)
            log.push("km:clips")
            continue
          }
          // Spoken; a language the phone can't say → English (for Khmer), else the melody — never silence.
          if (await speak(announcementText(e, lang), lang, volume, speed, log)) continue
          if (lang !== "en" && (await speak(announcementText(e, "en"), "en", volume, speed, log))) continue
          log.push("melody")
          await audible()
          await playMelody(volume)
        }
      }
      return done("played")
    } catch (error) {
      console.error("[soundbox] announcement failed:", error)
      log.push(`throw:${String(error).slice(0, 80)}`)
      return done("error")
    } finally {
      // Announced: the phone's audio is released again at once.
      release()
    }
  })
  queue = run
  return run
}
