/**
 * The SoundBox's native feed (founder, 24/10/2026 — Task #487): the sales a counter phone's foreground service plays by
 * itself, with no WebView (a Huawei froze it with the screen off). The server picks them and their clips here; the
 * phone only fetches and plays. The same rules as the SoundBox page: a sale (an amount, KHR or USD), never a late push
 * (the bank's time over 10 min before the server got it), and only while fresh (recorded at most 5 min ago). Pure.
 */
import { announceLate, isLatePush, khmerClipSequence, khmerClipUrl, VOICE_SPEEDS, DEFAULT_VOICE_SPEED, type VoiceSpeed } from "@/lib/soundbox"

/** How often the service asks (a few seconds: a customer is still at the counter). */
export const FEED_POLL_MS = 4_000

export type FeedRow = { id: string; amount: number | string; currency: string; transaction_time: string | null; created_at: string }
export type FeedItem = { id: string; createdAt: string; amount: number; currency: "KHR" | "USD"; clips: string[] }

/** The speed the page asked for (1.0 / 1.2 / 1.3), anything else the default. */
export function feedSpeed(raw: string | null | undefined): VoiceSpeed {
  const v = Number(raw)
  return VOICE_SPEEDS.find((s) => s === v) ?? DEFAULT_VOICE_SPEED
}

/** Where the next ask resumes: never before 5 minutes ago (an old sale is never announced), else the phone's cursor. */
export function feedSince(raw: string | null | undefined, now: number): string {
  const floor = now - 5 * 60_000
  const t = raw ? Date.parse(raw) : NaN
  return new Date(Number.isFinite(t) ? Math.max(t, floor) : floor).toISOString()
}

/** The sales to announce, oldest first, each with its clips (absolute URLs, at the page's speed). */
export function feedItems(rows: FeedRow[], now: number, speed: VoiceSpeed, origin: string): FeedItem[] {
  const out: FeedItem[] = []
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const amount = Number(r.amount)
    const currency = r.currency === "KHR" || r.currency === "USD" ? r.currency : null
    if (!(amount > 0) || !currency) continue
    if (isLatePush(r.transaction_time, r.created_at) || !announceLate(r.created_at, now)) continue
    out.push({ id: r.id, createdAt: r.created_at, amount, currency, clips: khmerClipSequence(amount, currency).map((c) => `${origin}${khmerClipUrl(c, speed)}`) })
  }
  return out
}

/** The cursor after this answer: the newest sale it saw (announced or not), else where it started. */
export const feedCursor = (rows: Pick<FeedRow, "created_at">[], since: string) => rows.map((r) => r.created_at).sort().at(-1) ?? since
