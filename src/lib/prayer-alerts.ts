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

/** Stops the Adhan if it is playing. */
export function stopSound() {
  if (!playing) return
  playing.pause()
  if (playing.src.startsWith("blob:")) URL.revokeObjectURL(playing.src)
  playing = null
  playingSource = null
  notify()
}

async function play(src: string, source: string) {
  stopSound()
  const audio = new Audio(src)
  playing = audio
  playingSource = source
  audio.onended = stopSound
  notify()
  await audio.play()
}

/** A soft three-note bell, synthesised (no audio file needed). */
export function playChime() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
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
  window.setTimeout(() => void ctx.close(), 3_500)
}

/** Plays a built-in Adhan by its /public path (preview or alert). */
export async function playPreset(file: string, id: string) {
  await play(file, id)
}

/**
 * Plays the chosen Adhan: a built-in preset (`presetFile`) or the file picked
 * from the phone. Falls back to the chime when there is none or the browser
 * blocks playback.
 */
export async function playAdhan(choice: { presetFile?: string | null; presetId?: string } = {}): Promise<"adhan" | "chime"> {
  try {
    if (choice.presetFile) {
      await play(choice.presetFile, choice.presetId ?? "preset")
      return "adhan"
    }
    const blob = await loadAdhan()
    if (blob) {
      await play(URL.createObjectURL(blob), "custom")
      return "adhan"
    }
  } catch {
    stopSound()
  }
  playChime()
  return "chime"
}

// ---------------------------------------------------------------- Notifications

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window

/** Shows a system notification (through the service worker when there is one, so it works on Android). */
export async function showPrayerNotification(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return
  const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: "/islamic/prayer" } }
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) return void (await reg.showNotification(title, options))
  } catch {
    // fall through to a page notification
  }
  try {
    new Notification(title, options)
  } catch {
    // Some mobile browsers only allow service-worker notifications.
  }
}
