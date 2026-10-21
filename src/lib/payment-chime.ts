/**
 * The payment chime on the phone (founder, 21/10/2026 — like an ABA Merchant soundbox, for DL MEAT SUPPLY's counter):
 * when a customer's KHQR payment arrives, the app rings «ទីង-ទីង» and shows «💰 ទទួលបានប្រាក់ +50,000 ៛». Pure
 * (payment-chime.test.ts); the listener is components/payments/payment-chime-listener.tsx.
 *
 * The same payments as the SoundBox (lib/soundbox.ts — the golden «sales only» rule): a KHQR sale the bank just
 * reported (soundbox_events), never a slip booked later, a held payment, a transfer, or one more than 10 minutes late.
 *
 * In the Android app: a notification on its own channel «Payment Alerts» (importance max, its sound
 * res/raw/payment_received.wav, vibration, on the lock screen) — while the app is open or still running in the
 * background. With the app closed nothing can wake it yet (no Firebase in the APK — see CLAUDE.md). In a browser:
 * the chime plays while the page is on screen. On /soundbox the SoundBox announces it itself (no double ring).
 */
import { isLatePush, soundboxPush } from "@/lib/soundbox"

/** The Android channel (a channel's sound can never change: a new sound is a new id). */
export const PAYMENT_CHANNEL = {
  id: "payment_alert_v1",
  name: "Payment Alerts",
  description: "ទទួលបានប្រាក់ — KHQR",
  sound: "payment_received.wav",
  importance: 5,
} as const

/** The chime in the browser (the same tones, rendered by scripts/render-payment-chime.py). */
export const PAYMENT_CHIME_URL = "/audio/payment_received.wav"

/** Notification ids from 500,000,000 — clear of the prayer alarms (200,000,000–399,999,999) and under 2^31. */
export const PAYMENT_ID_BASE = 500_000_000
export function paymentNotificationId(eventId: string): number {
  let h = 0
  for (const ch of eventId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return PAYMENT_ID_BASE + (h % 100_000_000)
}

export type PaymentEvent = {
  id: string
  amount: number
  currency: "KHR" | "USD"
  account_name?: string | null
  payer?: string | null
  transaction_time?: string | null
  created_at?: string | null
}

/** «💰 ទទួលបានប្រាក់ +50,000 ៛» and «payer · account» — the SoundBox's own words (lib/soundbox.ts soundboxPush). */
export function paymentChimeText(e: PaymentEvent): { title: string; body: string } {
  const p = soundboxPush({ id: e.id, amount: e.amount, currency: e.currency, account_name: e.account_name, payer: e.payer })
  return { title: p.title, body: p.body }
}

/**
 * Whether this phone rings for a payment: the switch is on, it is not on /soundbox (the SoundBox announces it), it is
 * not late (more than 10 minutes after the bank's time — never a late ring), and it has not rung for it already.
 */
export function shouldChime(o: { enabled: boolean; path: string; event: PaymentEvent; seen: ReadonlySet<string>; now: number }): boolean {
  if (!o.enabled || o.seen.has(o.event.id)) return false
  if (o.path === "/soundbox" || o.path.startsWith("/soundbox/")) return false
  return !isLatePush(o.event.transaction_time, o.event.created_at ?? o.now)
}

/** A realtime row as a payment (amounts arrive as strings from Postgres numerics). */
export function paymentFromRow(row: Record<string, unknown>): PaymentEvent | null {
  const id = typeof row.id === "string" ? row.id : null
  const amount = Number(row.amount)
  const currency = row.currency === "USD" ? "USD" : row.currency === "KHR" ? "KHR" : null
  if (!id || !Number.isFinite(amount) || amount <= 0 || !currency) return null
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  return { id, amount, currency, account_name: str(row.account_name), payer: str(row.payer), transaction_time: str(row.transaction_time), created_at: str(row.created_at) }
}
