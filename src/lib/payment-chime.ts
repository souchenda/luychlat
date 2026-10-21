/**
 * The payment chime on the phone (founder, 21/10/2026 — like an ABA Merchant soundbox, for DL MEAT SUPPLY's counter):
 * when a customer's KHQR payment arrives, the app rings «ទីង-ទីង» and shows «💰 ទទួលបានប្រាក់ +50,000 ៛». Pure
 * (payment-chime.test.ts); the listener is components/payments/payment-chime-listener.tsx.
 *
 * Two triggers (founder, 21/10/2026 — «smart dual-trigger»):
 *   A  a KHQR sale the bank just reported (soundbox_events — the SoundBox's own, the golden «sales only» rule; never one
 *      more than 10 minutes late);
 *   B  an income slip scanned and confirmed in the bot (payment_chimes — bot_payment_chime_emit: business income only,
 *      never an expense, a transfer or a loan repayment) — «វិក្កយបត្រ ABA · កត់ត្រាជោគជ័យ».
 * Never twice: one ring per transaction on this phone, and the database never emits a slip chime for a payment (its
 * bank reference) that already rang.
 *
 * In the Android app: a notification on its own channel «Payment Alerts» (importance max, its sound
 * res/raw/payment_received.wav, vibration, on the lock screen) — while the app is open or still running in the
 * background. With the app closed nothing can wake it yet (no Firebase in the APK — see CLAUDE.md). In a browser:
 * the chime plays while the page is on screen. On /soundbox the SoundBox announces it itself (no double ring).
 */
import { announcementText, isLatePush, soundboxPush, VOICE_TAGS, type VoiceLang } from "@/lib/soundbox"

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

export type PaymentSource = "khqr" | "slip"

export type PaymentEvent = {
  id: string
  /** A — a KHQR sale (soundbox_events); B — a confirmed income slip (payment_chimes). */
  source: PaymentSource
  /** The transaction it rang for — one ring per transaction, whichever trigger came first. */
  transaction_id?: string | null
  /** The slip's bank («ABA Bank») — B only. */
  bank?: string | null
  amount: number
  currency: "KHR" | "USD"
  account_name?: string | null
  payer?: string | null
  transaction_time?: string | null
  created_at?: string | null
}

/**
 * «💰 ទទួលបានប្រាក់ +50,000 ៛» — the SoundBox's own words (lib/soundbox.ts soundboxPush) — with «payer · account» for a
 * KHQR sale, «វិក្កយបត្រ ABA Bank · កត់ត្រាជោគជ័យ» for a confirmed slip.
 */
export function paymentChimeText(e: PaymentEvent): { title: string; body: string } {
  const p = soundboxPush({ id: e.id, amount: e.amount, currency: e.currency, account_name: e.account_name, payer: e.payer })
  if (e.source === "slip") return { title: p.title, body: `វិក្កយបត្រ${e.bank ? ` ${e.bank}` : ""} · កត់ត្រាជោគជ័យ` }
  return { title: p.title, body: p.body }
}

/** The key a ring is remembered by: its transaction (both triggers), else the event. */
export const ringKey = (e: PaymentEvent) => e.transaction_id || `${e.source}:${e.id}`

/**
 * Whether this phone rings: the switch is on and it has not rung for this transaction already (either trigger). A KHQR
 * sale: not on /soundbox (the SoundBox announces it) and not late (more than 10 minutes after the bank's time — never
 * a late ring). A confirmed slip always rings — it is the confirmation of what was just recorded.
 */
export function shouldChime(o: { enabled: boolean; path: string; event: PaymentEvent; seen: ReadonlySet<string>; now: number }): boolean {
  if (!o.enabled || o.seen.has(ringKey(o.event))) return false
  if (o.event.source === "slip") return true
  if (o.path === "/soundbox" || o.path.startsWith("/soundbox/")) return false
  return !isLatePush(o.event.transaction_time, o.event.created_at ?? o.now)
}

/** A realtime row as a payment (amounts arrive as strings from Postgres numerics): soundbox_events → A, payment_chimes → B. */
export function paymentFromRow(row: Record<string, unknown>, source: PaymentSource = "khqr"): PaymentEvent | null {
  const id = typeof row.id === "string" ? row.id : null
  const amount = Number(row.amount)
  const currency = row.currency === "USD" ? "USD" : row.currency === "KHR" ? "KHR" : null
  if (!id || !Number.isFinite(amount) || amount <= 0 || !currency) return null
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  return { id, source, transaction_id: str(row.transaction_id), bank: str(row.bank), amount, currency, account_name: str(row.account_name), payer: str(row.payer), transaction_time: str(row.transaction_time), created_at: str(row.created_at) }
}

/** A device voice, as the browser lists it (speechSynthesis.getVoices). */
export type DeviceVoice = { lang: string; name?: string }

const speaks = (voices: readonly DeviceVoice[], lang: VoiceLang) => voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang))

/**
 * What the phone SAYS after the chime (founder, 21/10/2026 — Task #442, like an ABA / Bakong soundbox, hands-free): the
 * SoundBox's own words (lib/soundbox.ts › announcementText) — «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល», «ទទួលបានប្រាក់
 * ម្ភៃប្រាំដុល្លារ» — in Khmer words, so every Khmer voice reads the amount the same way (digits are read differently
 * by each engine). A device with no Khmer voice says it in English («Received 50,000 riel»), as the SoundBox does;
 * none at all → null (the chime and the notification stay).
 */
export function paymentSpeech(e: Pick<PaymentEvent, "amount" | "currency">, voices: readonly DeviceVoice[]): { lang: VoiceLang; tag: string; voice: string | null; text: string } | null {
  for (const lang of ["km", "en"] as const) {
    const v = speaks(voices, lang)
    if (v) return { lang, tag: VOICE_TAGS[lang], voice: v.name ?? null, text: announcementText(e, lang) }
  }
  return null
}

/** The chime first, then the voice: how long to wait for the chime when its end isn't reported (ms). */
export const SPEECH_AFTER_CHIME_MS = 1_400

/**
 * Counter Soundbox Mode (Task #442): a shop's counter phone — Business workspaces only, this device only. The screen is
 * kept on everywhere in the app (the wake lock), and the chime and the voice stay on.
 */
export const counterModeActive = (o: { on: boolean; business: boolean }) => o.on && o.business
