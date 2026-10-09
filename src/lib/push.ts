"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

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
