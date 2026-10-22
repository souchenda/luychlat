/**
 * Prayer-time alerts, entirely on the device: a notification when a prayer
 * time arrives, with a gentle chime or an Adhan recording the user picked from
 * their own phone (kept in IndexedDB, never uploaded).
 *
 * Alerts fire while LuyChlat is open or running in the background. Once the
 * phone's system freezes or closes the app, nothing can fire until it is
 * opened again (that would need server push).
 */

import type { PrayerKey, PrayerTimes } from "@/lib/prayer"

export const ALERT_PRAYERS: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
/** Late ticks (background tabs are throttled to about one a minute) still count for this long. */
export const ALERT_WINDOW_MINUTES = 5
export const ADHAN_MAX_BYTES = 15 * 1024 * 1024

/** The prayer whose time arrived within the alert window, if any. */
export function duePrayer(times: PrayerTimes, minutes: number): PrayerKey | null {
  for (const key of ALERT_PRAYERS) {
    if (minutes >= times[key] && minutes < times[key] + ALERT_WINDOW_MINUTES) return key
  }
  return null
}

/** "2026-10-02:asr": each prayer alerts once a day, even with several tabs or reloads. */
export const alertId = (date: { year: number; month: number; day: number }, key: PrayerKey) =>
  `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}:${key}`

const FIRED_KEY = "luychlat-prayer-alert-last"

/** True the first time it is called for an id (across tabs, via localStorage). */
export function claimAlert(id: string): boolean {
  try {
    const seen = (localStorage.getItem(FIRED_KEY) ?? "").split(",")
    if (seen.includes(id)) return false
    localStorage.setItem(FIRED_KEY, [id, ...seen].slice(0, 10).join(","))
    return true
  } catch {
    return true
  }
}

// ---------------------------------------------------------------- Adhan file (IndexedDB)

const DB = "luychlat-adhan"
const STORE = "audio"
const KEY = "adhan"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const saveAdhan = (file: Blob) => tx("readwrite", (s) => s.put(file, KEY))
export const deleteAdhan = () => tx("readwrite", (s) => s.delete(KEY))
export const loadAdhan = () => tx<Blob | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<Blob | undefined>)

// ---------------------------------------------------------------- Sounds

let playing: HTMLAudioElement | null = null
/** Which source is playing (a preset id, "custom", or null), for ▶/⏸ buttons. */
let playingSource: string | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Re-renders a component when playback starts or stops. */
export function onPlaybackChange(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const currentSource = () => playingSource

// ---------------------------------------------------------------- 🔇 Stop Adhan (founder, 18/10/2026)

/** The notification's «🔇 បិទសំឡេង» action, and the service worker's message to the open app (public/sw.js). */
export const STOP_ADHAN_ACTION = "stop-adhan"
export const STOP_ADHAN_MESSAGE = "luychlat-stop-adhan"
export const isStopAdhanMessage = (data: unknown) => !!data && typeof data === "object" && (data as { type?: unknown }).type === STOP_ADHAN_MESSAGE

/** Whether the lock-screen controls are ours (never taken from the Quran / nasheed player). */
let ownsMediaSession = false

function claimMediaSession(title: string) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || navigator.mediaSession.metadata) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "អេប លុយឆ្លាត", artwork: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] })
    for (const action of ["pause", "stop"] as MediaSessionAction[]) navigator.mediaSession.setActionHandler(action, stopSound)
    ownsMediaSession = true
  } catch {
    // An older browser without these actions: the in-app banner still stops it.
  }
}

function releaseMediaSession() {
  if (!ownsMediaSession) return
  ownsMediaSession = false
  try {
    for (const action of ["pause", "stop"] as MediaSessionAction[]) navigator.mediaSession.setActionHandler(action, null)
    navigator.mediaSession.metadata = null
  } catch {
    // nothing to release
  }
}

/** Stops the Adhan at once and resets it to the start: the banner, the lock screen and the notification all call this. */
export function stopSound() {
  if (!playing) return
  const audio = playing
  playing = null
  playingSource = null
  audio.pause()
  audio.currentTime = 0
  if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src)
  releaseMediaSession()
  notify()
}

/** The open app listens for the notification's 🔇 (relayed by the service worker). Returns the unsubscribe. */
export function listenForStopAdhan() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {}
  const onMessage = (e: MessageEvent) => {
    if (isStopAdhanMessage(e.data)) stopSound()
  }
  navigator.serviceWorker.addEventListener("message", onMessage)
  return () => navigator.serviceWorker.removeEventListener("message", onMessage)
}

// ---------------------------------------------------------------- Autoplay unlock (founder, 22/10/2026 — Task #466)

/**
 * Why Dhuhr was silent on 22/10: a prayer time arrives from a timer, not a tap, and browsers refuse `play()` without
 * one — iPhones always, Chrome until the page was touched once. The chime fallback opened a new AudioContext, as
 * blocked. So the first tap anywhere in the app unlocks ONE audio element and ONE audio context (a few ms of
 * silence), and every Adhan and chime after it plays through them — at the prayer minute, no tap needed.
 */
let primedAudio: HTMLAudioElement | null = null
let chimeCtx: AudioContext | null = null

/** 50 ms of silence as a WAV (8 kHz, 8-bit mono): what the unlocking tap plays. */
export function silentWav(ms = 50): Uint8Array {
  const samples = Math.max(1, Math.round((8_000 * ms) / 1_000))
  const b = new Uint8Array(44 + samples)
  const v = new DataView(b.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)))
  text(0, "RIFF")
  v.setUint32(4, 36 + samples, true)
  text(8, "WAVEfmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, 8_000, true)
  v.setUint32(28, 8_000, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  text(36, "data")
  v.setUint32(40, samples, true)
  b.fill(128, 44) // 8-bit silence is the midpoint
  return b
}

/** Inside a tap: the shared audio element and context unlocked for later, timer-driven playback. */
export function primeAdhanAudio(): void {
  if (typeof window === "undefined") return
  try {
    if (!primedAudio) {
      const audio = new Audio()
      audio.src = URL.createObjectURL(new Blob([silentWav() as BlobPart], { type: "audio/wav" }))
      primedAudio = audio
      void audio.play().catch(() => {
        if (primedAudio === audio) primedAudio = null // not unlocked: the next tap tries again
      })
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      chimeCtx ??= new Ctx()
      if (chimeCtx.state === "suspended") void chimeCtx.resume().catch(() => {})
    }
  } catch {
    // no audio here
  }
}

/** Unlocks on the first taps after a launch (until it worked); returns the unsubscribe. */
export function primeOnFirstTap(): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["pointerdown", "keydown", "touchend"] as const
  const off = () => events.forEach((e) => window.removeEventListener(e, onTap, true))
  function onTap() {
    primeAdhanAudio()
    if (primedAudio && chimeCtx?.state === "running") off()
  }
  events.forEach((e) => window.addEventListener(e, onTap, true))
  return off
}

async function play(src: string, source: string, title = "Adhan · الأذان") {
  stopSound()
  // The unlocked element when a tap primed it (it may play from a timer), else a new one.
  const audio = primedAudio ?? new Audio()
  // Read with CORS, so the service worker can keep an Adhan the admin published (Supabase Storage) for offline alerts.
  audio.crossOrigin = src.startsWith("blob:") ? null : "anonymous"
  audio.src = src
  playing = audio
  playingSource = source
  audio.onended = stopSound
  notify()
  try {
    await audio.play()
  } catch (e) {
    if (playing === audio) {
      playing = null
      playingSource = null
      notify()
    }
    throw e
  }
  if (playing === audio) claimMediaSession(title)
}

/** A soft three-note bell, synthesised (no audio file needed). */
export function playChime(): boolean {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return false
  // The context a tap unlocked (a new one from a timer starts suspended — silent).
  const shared = chimeCtx
  const ctx = shared ?? new Ctx()
  if (ctx.state === "suspended") void ctx.resume().catch(() => {})
  const notes = [659.25, 783.99, 1046.5] // E5, G5, C6
  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * 0.45
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 1.7)
  })
  if (!shared) window.setTimeout(() => void ctx.close(), 3_500)
  return ctx.state === "running"
}

/** Plays a built-in Adhan by its /public path (preview or alert). */
export async function playPreset(file: string, id: string) {
  await play(file, id)
}

/**
 * Plays the chosen Adhan: a built-in preset (`presetFile`) or the file picked
 * from the phone. Falls back to the chime when there is none; "blocked" when the
 * browser refused sound (no tap yet) — the caller offers a «▶» tap instead of silence.
 */
export async function playAdhan(choice: { presetFile?: string | null; presetId?: string; title?: string } = {}): Promise<"adhan" | "chime" | "blocked"> {
  try {
    if (choice.presetFile) {
      await play(choice.presetFile, choice.presetId ?? "preset", choice.title)
      return "adhan"
    }
    const blob = await loadAdhan()
    if (blob) {
      await play(URL.createObjectURL(blob), "custom", choice.title)
      return "adhan"
    }
  } catch (e) {
    stopSound()
    if (e instanceof DOMException && e.name === "NotAllowedError") return "blocked"
  }
  return playChime() ? "chime" : "blocked"
}

// ---------------------------------------------------------------- Notifications

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window

/** The service worker notification's options; with the Adhan playing it carries the «🔇 បិទសំឡេង» action. */
export function prayerNotificationOptions(body: string, tag: string, stopLabel?: string) {
  return {
    body,
    tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: "/islamic/prayer", adhan: Boolean(stopLabel) },
    ...(stopLabel ? { actions: [{ action: STOP_ADHAN_ACTION, title: stopLabel }], requireInteraction: true } : {}),
  }
}

/**
 * Shows a system notification (through the service worker when there is one, so it works on Android). With
 * `stopLabel` (the Adhan is playing) it has a «🔇 បិទសំឡេង» button; swiping it away stops the Adhan too.
 */
export async function showPrayerNotification(title: string, body: string, tag: string, stopLabel?: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return
  const options = prayerNotificationOptions(body, tag, stopLabel)
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) return void (await reg.showNotification(title, options as NotificationOptions))
  } catch {
    // fall through to a page notification
  }
  try {
    const { actions: _actions, ...page } = options as NotificationOptions & { actions?: unknown }
    void _actions
    new Notification(title, page)
  } catch {
    // Some mobile browsers only allow service-worker notifications.
  }
}
