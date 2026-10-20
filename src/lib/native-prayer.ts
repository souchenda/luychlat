"use client"

/**
 * The native Adhan in the Android app (founder, 20/10/2026): inside the Capacitor shell the prayers are scheduled as
 * local notifications on a high-priority channel whose sound is the Adhan (android/app/src/main/res/raw/adhan.mp3) —
 * it rings at the exact minute with the screen locked and the app closed, and survives a reboot (the plugin's boot
 * receiver). In a browser this module does nothing: the Web Push and Telegram alerts carry on.
 */
import { isNativeApp } from "@/lib/native-bridge"
import { NATIVE_CHANNELS, isNativePrayerId, nativePrayerPlan, type NativeSound } from "@/lib/native-prayer-plan"
import type { PrayerKey } from "@/lib/prayer"

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications)

let channelsReady: Promise<void> | null = null
/** The three channels (Adhan, chime, silent), once per launch — creating an existing channel changes nothing. */
function ensureChannels(): Promise<void> {
  return (channelsReady ??= plugin().then(async (n) => {
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
  const n = await plugin()
  if ((await n.checkPermissions()).display !== "granted") return 0
  await ensureChannels()
  await cancelNativePrayers()
  const channel = NATIVE_CHANNELS[o.sound]
  const plan = nativePrayerPlan(new Date(), o.lat, o.lng)
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
