"use client"

/**
 * 💰 The payment chime on this phone (founder, 21/10/2026 — lib/payment-chime.ts): on every screen of the app, a KHQR
 * sale the bank just reported (A) or an income slip confirmed in the bot (B) rings «ទីង-ទីង» with «💰 ទទួលបានប្រាក់
 * +50,000 ៛» — once per transaction. In the Android app it is a notification
 * on the «Payment Alerts» channel (its own sound, vibration, the lock screen) while the app is open or running; in a
 * browser the chime plays while the page is on screen. On /soundbox the SoundBox announces it itself.
 */
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { isNativeApp } from "@/lib/native-bridge"
import { PAYMENT_CHANNEL, PAYMENT_CHIME_URL, paymentChimeText, paymentFromRow, paymentNotificationId, ringKey, shouldChime, type PaymentEvent, type PaymentSource } from "@/lib/payment-chime"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications)

let channelReady: Promise<void> | null = null
/** The «Payment Alerts» channel, once per launch (creating an existing channel changes nothing). */
function ensurePaymentChannel(): Promise<void> {
  return (channelReady ??= plugin()
    .then((n) =>
      n.createChannel({
        id: PAYMENT_CHANNEL.id,
        name: PAYMENT_CHANNEL.name,
        description: PAYMENT_CHANNEL.description,
        importance: PAYMENT_CHANNEL.importance,
        visibility: 1, // shown on the lock screen
        vibration: true,
        lights: true,
        sound: PAYMENT_CHANNEL.sound,
      }),
    )
    .catch(() => {
      channelReady = null
    }))
}

/** From the settings switch (a tap): the notification permission in the Android app. True when allowed (or not native). */
export async function requestPaymentChimePermission(): Promise<boolean> {
  if (!isNativeApp()) return true
  const n = await plugin()
  const perm = await n.requestPermissions().catch(() => null)
  await ensurePaymentChannel()
  return perm?.display === "granted"
}

/** The chime alone (the settings switch plays it once when turned on; the browser's ring). */
export function playPaymentChimeSound(): void {
  try {
    const a = new Audio(PAYMENT_CHIME_URL)
    a.volume = 1
    void a.play().catch(() => {}) // a browser may refuse sound before the first tap — the notification still shows
  } catch {
    // no audio here
  }
}

async function ring(e: PaymentEvent): Promise<void> {
  const { title, body } = paymentChimeText(e)
  if (isNativeApp()) {
    await ensurePaymentChannel()
    const n = await plugin()
    // No schedule: shown at once, on the channel whose sound is the chime (vibration, the lock screen).
    await n.schedule({ notifications: [{ id: paymentNotificationId(ringKey(e)), title, body, channelId: PAYMENT_CHANNEL.id, sound: PAYMENT_CHANNEL.sound, extra: { url: "/soundbox" } }] })
    return
  }
  if (typeof document !== "undefined" && document.visibilityState === "visible") playPaymentChimeSound()
}

export function PaymentChimeListener() {
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const enabled = usePrefsStore((s) => s.paymentChime)
  const pathname = usePathname()
  const path = useRef(pathname)
  path.current = pathname
  const on = useRef(enabled)
  on.current = enabled
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !userId) return
    if (isNativeApp()) void ensurePaymentChannel()
    let stopped = false
    let retry: number | undefined
    let attempt = 0
    let channel: ReturnType<typeof supabase.channel> | null = null
    // New receipts only, live (RLS: the workspaces this person belongs to) — rejoined with a growing delay if dropped.
    const connect = () => {
      if (stopped) return
      const onRow = (source: PaymentSource) => ({ new: row }: { new: unknown }) => {
        const e = paymentFromRow(row as Record<string, unknown>, source)
        if (!e || !shouldChime({ enabled: on.current, path: path.current ?? "", event: e, seen: seen.current, now: Date.now() })) return
        seen.current.add(ringKey(e))
        void ring(e).catch((err) => console.error("[payment-chime]", err))
      }
      // A — the KHQR sales (the SoundBox's events); B — the income slips confirmed in the bot.
      const ch = supabase
        .channel(`payment-chime:${userId}:${Date.now()}`)
        .on("postgres_changes", { schema: "public", table: "soundbox_events", event: "INSERT" }, onRow("khqr"))
        .on("postgres_changes", { schema: "public", table: "payment_chimes", event: "INSERT" }, onRow("slip"))
      channel = ch
      ch.subscribe((status) => {
        if (stopped || channel !== ch) return
        if (status === "SUBSCRIBED") attempt = 0
        else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          channel = null
          void supabase.removeChannel(ch)
          window.clearTimeout(retry)
          retry = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt++))
        }
      })
    }
    connect()
    return () => {
      stopped = true
      window.clearTimeout(retry)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId])

  return null
}
