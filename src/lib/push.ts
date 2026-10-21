"use client"

import { PROVINCES } from "@/lib/prayer"
import { pushProvince } from "@/lib/prayer-push"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"

/**
 * Phone push notifications (the 07:00 morning message). Needs the service worker,
 * the Push API and a server key; on iPhone only once the app is added to the Home
 * Screen (iOS 16.4+).
 */
export type PushState = "unsupported" | "ios_install" | "off" | "denied" | "on" | "not_configured"

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true)

let keyCache: Promise<string | null> | null = null
const serverKey = () =>
  (keyCache ??= fetch("/api/push/key", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { key: null }))
    .then((j: { key?: string | null }) => j.key ?? null)
    .catch(() => null))

/** VAPID public key (base64url) → the bytes PushManager wants. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function pushState(): Promise<PushState> {
  if (isIos() && !standalone()) return "ios_install"
  if (!supported()) return "unsupported"
  if (!(await serverKey())) return "not_configured"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === "granted" ? "on" : "off"
}

/** Asks the phone (only from a tap), subscribes and saves this device. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return "unsupported"
  const key = await serverKey()
  if (!key) return "not_configured"
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return permission === "denied" ? "denied" : "off"
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"))
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const supabase = getSupabaseBrowserClient()
  if (!supabase || !json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("push_subscribe_failed")
  const { error } = await supabase.rpc("push_subscribe", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent.slice(0, 200) })
  if (error) throw error
  // The new subscription learns this phone's prayer province at once (founder, 21/10/2026).
  const { place, gps } = useIslamicLocalStore.getState()
  syncedProvince = null
  await setPrayerProvince(pushProvince(place, gps, PROVINCES)).catch(() => false)
  return "on"
}

/** Stops notifications on this device (and forgets it on the server). */
export async function disablePush(): Promise<PushState> {
  const reg = supported() ? await navigator.serviceWorker.getRegistration() : undefined
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const supabase = getSupabaseBrowserClient()
    await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
    await sub.unsubscribe().catch(() => false)
  }
  return "off"
}

/**
 * The prayer-time push for this phone (founder, 20/10/2026): the server rings it at each prayer even with the app
 * closed; the app's prayer-alert switch turns it on or off here. False when this phone has no push subscription.
 */
export async function setPrayerPush(on: boolean): Promise<boolean> {
  if (!supported()) return false
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  const supabase = getSupabaseBrowserClient()
  if (!sub || !supabase) return false
  const { data, error } = await supabase.rpc("set_prayer_push", { p_endpoint: sub.endpoint, p_on: on })
  return !error && data === true
}

/**
 * This phone's prayer province for the server's push (founder, 21/10/2026 — Yerny's lock screen rang at Phnom Penh's
 * 18:52, her app set to Kampot said Isha at 18:56): saved on this phone's subscription, so the server rings it at its
 * province's own time with its name. Sent once per value per session; false without a push subscription.
 */
let syncedProvince: string | null = null
export async function setPrayerProvince(province: string): Promise<boolean> {
  if (!supported() || syncedProvince === province) return false
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  const supabase = getSupabaseBrowserClient()
  if (!sub || !supabase) return false
  const { data, error } = await supabase.rpc("set_prayer_province", { p_endpoint: sub.endpoint, p_province: province })
  const ok = !error && data === true
  if (ok) syncedProvince = province
  return ok
}
