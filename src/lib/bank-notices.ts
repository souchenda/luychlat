import { parseBankAlert, type BankAlert } from "@/lib/bot/bank-alert"

/**
 * A bank app's notification on the person's Android phone (founder, 9/11/2026 — android/…/BankNoticeListener.java) turned
 * into the payload of public.app_bank_alert. Pure. The reader is the bot's own (lib/bot/bank-alert.ts): the notice's text
 * first, then its title and text together («Received» is often only in the title). A notice it cannot read is not
 * recorded — never guessed — and is kept on the phone for Settings to show (unread).
 */
export type BankNotice = { pkg: string; title: string; text: string; time: number }

export type NoticePayload = BankAlert & { fingerprint: string; posted_at: string }

const pad = (n: number) => String(n).padStart(2, "0")

/** The notice's own time as Cambodia time (+07:00). */
export function cambodiaIso(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`
}

/** The text the fingerprint is taken from — the same normalisation as the bot's (lib/server/bank-alert-bot.ts). */
export const fingerprintText = (raw: string) => raw.replace(/\s+/g, " ").trim().toLowerCase()

export function readNotice(n: BankNotice): { alert: BankAlert; raw: string } | null {
  for (const raw of [n.text, `${n.title}. ${n.text}`]) {
    const alert = parseBankAlert(raw)
    if (alert) return { alert, raw }
  }
  return null
}

/** sha256 hex, first 40 characters (as the bot), with the browser's own crypto. */
export async function fingerprintOf(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintText(raw)))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40)
}

export async function noticePayload(n: BankNotice): Promise<NoticePayload | null> {
  const read = readNotice(n)
  if (!read) return null
  // The bank's own date when the notice states one, else the moment the phone received it.
  return { ...read.alert, fingerprint: await fingerprintOf(read.raw), posted_at: read.alert.postedAt ?? cambodiaIso(n.time) }
}
