"use client"

/**
 * The native Adhan in the Android app (founder, 20/10/2026): inside the Capacitor shell the prayers are scheduled as
 * local notifications on a high-priority channel whose sound is the Adhan (android/app/src/main/res/raw/adhan.mp3) —
 * it rings at the exact minute with the screen locked and the app closed, and survives a reboot (the plugin's boot
 * receiver). In a browser this module does nothing: the Web Push and Telegram alerts carry on.
 */
import { registerPlugin } from "@capacitor/core"
import { create } from "zustand"

import { isNativeApp } from "@/lib/native-bridge"
import { NATIVE_CHANNELS, isNativePrayerId, nativePrayerPlan, type NativeSound } from "@/lib/native-prayer-plan"
import type { PrayerKey } from "@/lib/prayer"

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications)

/**
 * The Adhan as a real alarm clock, from APK 1.6 (founder, 23/10/2026 — Task #474: on 1.5 the 10 s lock-screen test never
 * rang): AlarmManager.setAlarmClock (android/…/AdhanAlarmPlugin.java) — never deferred by Doze, the least likely to be
 * held by a phone maker's battery manager. An APK before 1.6 has no such plugin: its calls reject and the
 * local-notifications plugin is used instead (its exact alarm falls back to an inexact one when Android refuses).
 */
type NativeAlarm = { id: number; at: number; title: string; body: string; channelId: string }

/** APK 1.6+ (build 7) ships the alarm-clock plugin. */
const hasAlarmClock = () => Number(/\bLuyChlatApp\/(\d+)\b/.exec(typeof navigator === "undefined" ? "" : navigator.userAgent)?.[1] ?? 0) >= 7
const AdhanAlarm = registerPlugin<{
  schedule(o: { alarms: NativeAlarm[] }): Promise<{ scheduled: number; exact: boolean }>
  add(o: NativeAlarm): Promise<{ exact: boolean }>
  cancelAll(): Promise<void>
  status(): Promise<{ exact: boolean; notifications: boolean }>
  openExactAlarmSettings(): Promise<void>
}>("AdhanAlarm")

/**
 * The phone's alarm health for the prayer card: notifications allowed, exact alarms allowed (Android 12+ «Alarms &
 * reminders»), and whether the alarm clock of 1.6 is there. Null fields: unknown (a browser).
 */
export async function nativeAlarmHealth(): Promise<{ notifications: boolean | null; exact: boolean | null; alarmClock: boolean }> {
  if (!isNativeApp()) return { notifications: null, exact: null, alarmClock: false }
  const own = await AdhanAlarm.status().catch(() => null)
  if (own) return { notifications: own.notifications, exact: own.exact, alarmClock: true }
  const n = await plugin()
  const display = await n.checkPermissions().then((p) => p.display === "granted", () => null)
  const exact = await n.checkExactNotificationSetting().then((e) => e.exact_alarm === "granted", () => null)
  return { notifications: display, exact, alarmClock: false }
}

/** Android's «Alarms & reminders» switch for the app, so the Adhan rings at the minute (Android 12+). */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isNativeApp()) return
  const own = await AdhanAlarm.openExactAlarmSettings().then(() => true, () => false)
  if (own) return
  const n = await plugin()
  await n.changeExactNotificationSetting().catch(() => null)
}

/**
 * What the Android alarms are doing (founder, 22/10/2026 — Task #472): how many prayers are planned, or why none are
 * (no notification permission), shown on the prayer card — never silently «on». `replan()` asks the scheduler in the
 * app layout to plan again (after the permission is given, or when the app comes back on screen).
 */
export const useNativePrayerStatus = create<{
  planned: number | null
  permission: "granted" | "missing" | "error" | null
  /** Why planning failed (Task #479 — shown on the card and sent to the server's log). */
  error: string | null
  tick: number
  set: (s: { planned: number; permission: "granted" | "missing" | "error"; error?: string | null }) => void
  replan: () => void
}>((set) => ({
  planned: null,
  permission: null,
  error: null,
  tick: 0,
  set: (s) => set({ error: null, ...s }),
  replan: () => set((s) => ({ tick: s.tick + 1 })),
}))

/** The error's own words (a plugin rejection's message / code), short. */
export const errorText = (e: unknown) => {
  const x = e as { message?: unknown; code?: unknown } | null
  return String(x?.message || x?.code || e || "unknown").replace(/\s+/g, " ").slice(0, 200)
}

/**
 * A prayer-alarm failure sent to the server's event log (founder, 23/10/2026 — Task #479: «កំពុងកំណត់…» forever, the
 * test silent, the error swallowed): where, the phone's build, Android's words. Best effort, never in the way.
 */
export function reportNativeAlarmError(where: string, e: unknown): void {
  const build = /\bLuyChlatApp\/(\d+)\b/.exec(typeof navigator === "undefined" ? "" : navigator.userAgent)?.[1] ?? "?"
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "native-alarm", message: `${where} · build ${build} · ${errorText(e)}` }),
  }).catch(() => null)
}

/** The one-minute test alarm's id: outside the prayers' range (isNativePrayerId), so a re-plan never cancels it. */
export const NATIVE_TEST_ID = 199_999_999

/**
 * Each native step with a time limit (founder, 23/10/2026 — Task #480: on APK 1.7 the card said «កំពុងកំណត់…» forever —
 * a plugin call that never answered held every step behind it). Past the limit it fails with the step's name, which the
 * card shows and the server's log keeps (reportNativeAlarmError) — never a silent wait.
 */
export const NATIVE_STEP_MS = 10_000
export function step<T>(name: string, p: Promise<T>, ms = NATIVE_STEP_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name}: no answer from Android after ${Math.round(ms / 1000)} s`)), ms)
  })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

let channelsReady: Promise<void> | null = null
/** The channels (Adhan, chime, vibrate, silent), once per launch — creating an existing channel changes nothing. A failure is retried next time (never cached). */
function ensureChannels(): Promise<void> {
  return (channelsReady ??= step("channels", plugin().then(async (n) => {
    for (const c of Object.values(NATIVE_CHANNELS)) {
      await n.createChannel({
        id: c.id,
        name: c.name,
        description: "LuyChlat prayer times",
        importance: c.importance,
        visibility: 1, // shown on the lock screen
        vibration: c.importance >= 4,
        lights: c.importance >= 4,
        ...(c.sound ? { sound: c.sound } : {}),
      })
    }
  })).catch((e) => {
    channelsReady = null
    throw e
  }))
}

/**
 * From the prayer-alert switch (a tap): the notification permission, and the exact-alarm setting (Android 12+) so the
 * Adhan rings at the minute, not «around» it. True when notifications are allowed.
 */
export async function requestNativePrayerPermissions(): Promise<boolean> {
  if (!isNativeApp()) return false
  const n = await plugin()
  const perm = await n.requestPermissions()
  if (perm.display !== "granted") return false
  const exact = await n.checkExactNotificationSetting().catch(() => null)
  if (exact && exact.exact_alarm !== "granted") await n.changeExactNotificationSetting().catch(() => null)
  return true
}

/** Our scheduled prayer alarms are cancelled (switch off, or before a re-plan). */
export async function cancelNativePrayers(): Promise<void> {
  if (!isNativeApp()) return
  await AdhanAlarm.cancelAll().catch(() => null) // the alarm clock (1.6+)
  const n = await plugin()
  const pending = await n.getPending()
  const ours = pending.notifications.filter((p) => isNativePrayerId(p.id))
  if (ours.length) await n.cancel({ notifications: ours.map((p) => ({ id: p.id })) })
}

/**
 * The next week's prayers, replacing the ones planned before (at every launch, and when the place, the sound or the
 * language changes). The words come from the app (the member's language).
 */
export async function scheduleNativePrayers(o: { lat: number; lng: number; sound: NativeSound; text: (prayer: PrayerKey, time: string) => { title: string; body: string } }): Promise<number> {
  if (!isNativeApp()) return 0
  const n = await step("plugin", plugin())
  // No notification permission: nothing can ring — 0, so the in-app timer stays on and the card says why.
  if ((await step("permission", n.checkPermissions())).display !== "granted") return 0
  await ensureChannels()
  await step("cancel", cancelNativePrayers())
  const channel = NATIVE_CHANNELS[o.sound]
  const plan = nativePrayerPlan(new Date(), o.lat, o.lng)
  const words = (minutes: number, prayer: PrayerKey) => {
    const hh = String(Math.floor(Math.round(minutes) / 60)).padStart(2, "0")
    const mm = String(Math.round(minutes) % 60).padStart(2, "0")
    return o.text(prayer, `${hh}:${mm}`)
  }
  // 1.6+: the alarm clock (one place for every prayer — never also the plugin's, so never two Adhans).
  const clock = await step("schedule", AdhanAlarm.schedule({ alarms: plan.map((p) => ({ id: p.id, at: p.at.getTime(), channelId: channel.id, ...words(p.minutes, p.prayer) })) })).catch((e) => {
    if (hasAlarmClock()) reportNativeAlarmError("schedule", e) // 1.6+ has it: a refusal is a bug, never hidden
    return null
  })
  if (clock) return clock.scheduled
  await n.schedule({
    notifications: plan.map((p) => {
      const hh = String(Math.floor(Math.round(p.minutes) / 60)).padStart(2, "0")
      const mm = String(Math.round(p.minutes) % 60).padStart(2, "0")
      const { title, body } = o.text(p.prayer, `${hh}:${mm}`)
      return {
        id: p.id,
        title,
        body,
        channelId: channel.id,
        ...(channel.sound ? { sound: channel.sound } : {}),
        schedule: { at: p.at, allowWhileIdle: true },
        autoCancel: true,
        extra: { url: "/islamic/prayer", prayer: p.prayer },
      }
    }),
  })
  return plan.length
}

/** How soon the lock-screen test rings (founder, 23/10/2026 — Task #473: 10 s, not a minute — lock the phone and listen). */
export const NATIVE_TEST_DELAY_MS = 10_000

/**
 * ⏰ The test with the screen locked (Tasks #472 / #473): one Android alarm 10 s from now on the chosen channel — the same
 * exact, allow-while-idle alarm and Adhan sound as a prayer, so «lock the phone and wait» proves the real thing. Asks
 * for the notification permission first when it is missing.
 */
export async function scheduleNativeTestAdhan(o: { sound: NativeSound; title: string; body: string; inMs?: number }): Promise<"scheduled" | "no-permission"> {
  if (!isNativeApp()) return "no-permission"
  const n = await step("plugin", plugin())
  let perm = (await step("permission", n.checkPermissions())).display
  // Asking may wait on the person's answer: a longer limit.
  if (perm !== "granted") perm = (await step("ask permission", n.requestPermissions(), 60_000)).display
  if (perm !== "granted") return "no-permission"
  await ensureChannels()
  const channel = NATIVE_CHANNELS[o.sound]
  const at = Date.now() + (o.inMs ?? NATIVE_TEST_DELAY_MS)
  // 1.6+: the same alarm clock as the prayers.
  const added = await step("test alarm", AdhanAlarm.add({ id: NATIVE_TEST_ID, at, title: o.title, body: o.body, channelId: channel.id })).then(
    () => true,
    (e) => {
      if (hasAlarmClock()) reportNativeAlarmError("test", e)
      return false
    },
  )
  if (added) return "scheduled"
  await n.cancel({ notifications: [{ id: NATIVE_TEST_ID }] }).catch(() => null)
  await n.schedule({
    notifications: [
      {
        id: NATIVE_TEST_ID,
        title: o.title,
        body: o.body,
        channelId: channel.id,
        ...(channel.sound ? { sound: channel.sound } : {}),
        schedule: { at: new Date(at), allowWhileIdle: true },
        autoCancel: true,
        extra: { url: "/islamic/prayer" },
      },
    ],
  })
  return "scheduled"
}
