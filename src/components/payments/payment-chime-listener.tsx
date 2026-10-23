"use client"

/**
 * 💰 The payment chime on this phone (founder, 21/10/2026 — lib/payment-chime.ts): on every screen of the app, a KHQR
 * sale the bank just reported (A) or an income slip confirmed in the bot (B) rings «ទីង-ទីង» with «💰 ទទួលបានប្រាក់
 * +50,000 ៛» — once per transaction. In the Android app it is a notification
 * on the «Payment Alerts» channel (its own sound, vibration, the lock screen) while the app is open or running; in a
 * browser the chime plays while the page is on screen. On /soundbox the SoundBox announces it itself.
 * Then the amount is SPOKEN (Task #442 — «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល», hands-free like a bank soundbox): the device's own
 * Khmer voice (Web Speech), else the recorded Khmer clips — never English (Task #463); while the app is on screen (no web page can speak with the
 * screen locked — the counter mode keeps it on).
 */
import { LocalNotifications } from "@capacitor/local-notifications"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { isNativeApp } from "@/lib/native-bridge"
import { isQuiet, phoneQuiet, soundboxAwake } from "@/lib/native-keepalive"
import { PAYMENT_CHANNEL, PAYMENT_CHIME_URL, paymentChimeText, paymentClips, paymentSpeech, SPEECH_AFTER_CHIME_MS, paymentFromRow, paymentNotificationId, ringKey, shouldChime, type PaymentEvent, type PaymentSource } from "@/lib/payment-chime"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { readVoiceSpeed, reconnectDelay, type VoiceSpeed } from "@/lib/soundbox"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

import { useLiveStatus } from "./live-status"

/**
 * NEVER put a Capacitor plugin through a promise (founder, 23/10/2026 — Task #481): its Proxy answers `then` with a
 * native-call wrapper, so `import(…).then((m) => m.LocalNotifications)` or `await plugin` never settles — the payment
 * notification hung there. Imported statically and used directly (lib/native-prayer.ts says the same).
 */
const n = LocalNotifications

let channelReady: Promise<void> | null = null
/** The «Payment Alerts» channel, once per launch (creating an existing channel changes nothing). */
function ensurePaymentChannel(): Promise<void> {
  return (channelReady ??= n
    .createChannel({
      id: PAYMENT_CHANNEL.id,
      name: PAYMENT_CHANNEL.name,
      description: PAYMENT_CHANNEL.description,
      importance: PAYMENT_CHANNEL.importance,
      visibility: 1, // shown on the lock screen
      vibration: true,
      lights: true,
      sound: PAYMENT_CHANNEL.sound,
    })
    .catch(() => {
      channelReady = null
    }))
}

/** From the settings switch (a tap): the notification permission in the Android app. True when allowed (or not native). */
export async function requestPaymentChimePermission(): Promise<boolean> {
  if (!isNativeApp()) return true
  const perm = await n.requestPermissions().catch(() => null)
  await ensurePaymentChannel()
  return perm?.display === "granted"
}

/** The chime alone (the settings switch plays it once when turned on; the browser's ring). `then` runs when it ends. */
export function playPaymentChimeSound(then?: () => void): void {
  let done = false
  const next = () => {
    if (done) return
    done = true
    then?.()
  }
  try {
    const a = new Audio(PAYMENT_CHIME_URL)
    a.volume = 1
    a.addEventListener("ended", next, { once: true })
    void a.play().catch(next) // a browser may refuse sound before the first tap — the notification still shows
  } catch {
    // no audio here
  }
  if (then) window.setTimeout(next, SPEECH_AFTER_CHIME_MS + 600) // its end not reported: the voice still follows
}

let clipsHere: Promise<boolean> | null = null
/** Are the recorded Khmer clips on the server (public/audio/soundbox/khmer)? Asked once. */
function khmerClipsAvailable(): Promise<boolean> {
  return (clipsHere ??= fetch(paymentClips({ amount: 1, currency: "KHR" })[0], { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false))
}

/** The voice speed chosen in Settings (Task #465 — 1.2x unless changed); read at each payment, so a change counts at once. */
const voiceSpeed = (): VoiceSpeed => readVoiceSpeed(typeof localStorage === "undefined" ? null : localStorage)

/**
 * The recorded Khmer clips, one after another (the device has no Khmer voice) — gapless (Task #465): every clip is
 * loaded before the first plays, so each word starts the moment the one before ends (the clips carry no silence).
 */
/** «[SoundBox] Announce: …» (Task #482): what each announcement did, in the console — a silent phone diagnosed from facts. */
function announceLog(e: Pick<PaymentEvent, "amount" | "currency">, fields: Record<string, string>) {
  console.info(`[SoundBox] Announce: amount=${e.amount} ${e.currency}, ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(", ")}`)
}

async function playClips(urls: string[]): Promise<void> {
  const clips = urls.map((url) => {
    const a = new Audio(url)
    a.preload = "auto"
    a.load()
    return a
  })
  for (const a of clips) {
    await new Promise<void>((done) => {
      a.addEventListener("ended", () => done(), { once: true })
      a.addEventListener(
        "error",
        () => {
          console.error(`[SoundBox] clip failed to load: ${a.src}`)
          done()
        },
        { once: true },
      )
      void a.play().catch((err: unknown) => {
        console.error(`[SoundBox] clip refused: ${a.src} — ${(err as Error)?.name ?? err}`)
        done()
      })
    })
  }
}

/**
 * «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» — in Khmer only (Task #463): the device's Khmer voice, else the recorded Khmer clips when
 * they are on the server, else nothing after the chime (never an English voice). On screen only.
 */
export function speakPayment(e: Pick<PaymentEvent, "amount" | "currency">): void {
  // The phone on Silent / Vibrate / Do Not Disturb: never spoken (Task #476 — the chime is a notification sound, the
  // phone mutes it itself; the voice plays on the media stream, which it does not).
  void phoneQuiet().then((mode) => {
    announceLog(e, { quietStatus: String(mode), result: isQuiet(mode) ? "skipped (phone quiet)" : "speaking" })
    if (!isQuiet(mode)) speakNow(e)
  })
}

function speakNow(e: Pick<PaymentEvent, "amount" | "currency">): void {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
  // On screen — or, in the Android app with the SoundBox kept awake (Task #473), with the screen locked too.
  if (typeof document === "undefined" || (document.visibilityState !== "visible" && !soundboxAwake())) return
  const voices = synth?.getVoices() ?? []
  const say = typeof SpeechSynthesisUtterance === "undefined" ? null : paymentSpeech(e, voices)
  if (!say || !synth) {
    void khmerClipsAvailable().then((ok) => (ok ? playClips(paymentClips(e, voiceSpeed())) : undefined))
    return
  }
  const u = new SpeechSynthesisUtterance(say.text)
  u.lang = say.tag
  u.voice = voices.find((v) => v.name === say.voice) ?? null
  u.rate = voiceSpeed()
  synth.speak(u)
}

async function ring(e: PaymentEvent): Promise<void> {
  const { title, body } = paymentChimeText(e)
  if (isNativeApp()) {
    await ensurePaymentChannel()
    // No schedule: shown at once, on the channel whose sound is the chime (vibration, the lock screen).
    await n.schedule({ notifications: [{ id: paymentNotificationId(ringKey(e)), title, body, channelId: PAYMENT_CHANNEL.id, sound: PAYMENT_CHANNEL.sound, extra: { url: "/soundbox" } }] })
    // The notification's own sound is the chime; the amount follows it, spoken, while the app is on screen.
    window.setTimeout(() => speakPayment(e), SPEECH_AFTER_CHIME_MS)
    return
  }
  if (typeof document !== "undefined" && document.visibilityState === "visible") playPaymentChimeSound(() => speakPayment(e))
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
    // The device lists its voices only after the first ask (Chrome): asked now, so the first payment is spoken.
    if (typeof window !== "undefined") window.speechSynthesis?.getVoices()
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
        if (status === "SUBSCRIBED") {
          // Back after a drop (a redeploy, a network blip — Task #463): the chime is loaded again, ready to ring.
          if (attempt > 0) new Audio(PAYMENT_CHIME_URL).load()
          attempt = 0
          useLiveStatus.getState().setLive(true)
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          channel = null
          void supabase.removeChannel(ch)
          window.clearTimeout(retry)
          useLiveStatus.getState().setLive(false)
          retry = window.setTimeout(connect, reconnectDelay(attempt++)) // 2 s, 4 s, 8 s … up to 30 s
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
