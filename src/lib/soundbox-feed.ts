/**
 * The SoundBox's native feed (founder, 24/10/2026 — Task #487): the sales a counter phone's foreground service plays by
 * itself, with no WebView (a Huawei froze it with the screen off). The server picks them and their clips here; the
 * phone only fetches and plays. The same rules as the SoundBox page: a sale (an amount, KHR or USD), never a late push
 * (the bank's time over 10 min before the server got it), and only while fresh (recorded at most 5 min ago). Pure.
 */
import { announceLate, catchUpTotals, DEFAULT_VOICE_GENDER, isLatePush, khmerClipSequence, khmerClipUrl, quietSpanAt, VOICE_GENDERS, VOICE_SPEEDS, DEFAULT_VOICE_SPEED, type QuietSpan, type VoiceGender, type VoiceSpeed } from "@/lib/soundbox"

/** How often the service asks (a few seconds: a customer is still at the counter). */
export const FEED_POLL_MS = 4_000

export type FeedRow = { id: string; amount: number | string; currency: string; transaction_time: string | null; created_at: string }
export type FeedItem = { id: string; createdAt: string; amount: number; currency: "KHR" | "USD"; clips: string[] }

/** The speed the page asked for (1.0 / 1.2 / 1.3), anything else the default. */
export function feedSpeed(raw: string | null | undefined): VoiceSpeed {
  const v = Number(raw)
  return VOICE_SPEEDS.find((s) => s === v) ?? DEFAULT_VOICE_SPEED
}

/** The voice the page asked for (Task #509 — 👩 female / 👨 male); an APK before it sends none → female. */
export const feedVoice = (raw: string | null | undefined): VoiceGender => VOICE_GENDERS.find((g) => g === raw) ?? DEFAULT_VOICE_GENDER

/** Where the next ask resumes: never before 5 minutes ago (an old sale is never announced), else the phone's cursor. */
export function feedSince(raw: string | null | undefined, now: number): string {
  const floor = now - 5 * 60_000
  const t = raw ? Date.parse(raw) : NaN
  return new Date(Number.isFinite(t) ? Math.max(t, floor) : floor).toISOString()
}

/** The sales to announce, oldest first, each with its clips (absolute URLs, at the page's speed). */
export function feedItems(rows: FeedRow[], now: number, speed: VoiceSpeed, origin: string, voice: VoiceGender = DEFAULT_VOICE_GENDER): FeedItem[] {
  const out: FeedItem[] = []
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const amount = Number(r.amount)
    const currency = r.currency === "KHR" || r.currency === "USD" ? r.currency : null
    if (!(amount > 0) || !currency) continue
    if (isLatePush(r.transaction_time, r.created_at) || !announceLate(r.created_at, now)) continue
    out.push({ id: r.id, createdAt: r.created_at, amount, currency, clips: khmerClipSequence(amount, currency).map((c) => `${origin}${khmerClipUrl(c, speed, voice)}`) })
  }
  return out
}

/** The cursor after this answer: the newest sale it saw (announced or not), else where it started. */
export const feedCursor = (rows: Pick<FeedRow, "created_at">[], since: string) => rows.map((r) => r.created_at).sort().at(-1) ?? since

/**
 * Quiet during the prayer, for the native feed (founder, 26/10/2026 — Task #506): the page sends this device's spans
 * (soundbox_devices.quiet_spans); the server answers nothing while one is on, then — within 30 minutes of its end, once
 * (quiet_caught_to) — a single catch-up item. Works with the APK as it is: the item is clips like any sale.
 */
export function feedQuiet(now: number, spans: QuietSpan[], caughtTo: number | null): { quiet: QuietSpan | null; catchUp: QuietSpan | null } {
  const quiet = quietSpanAt(now, spans)
  const ended = spans.filter((s) => s.to <= now && now - s.to < 30 * 60_000 && s.to > (caughtTo ?? 0)).sort((a, b) => b.to - a.to)
  return { quiet, catchUp: quiet ? null : (ended[0] ?? null) }
}

/** A sale recorded inside a span: said by the catch-up, never on its own. */
export const inQuietSpan = (createdAt: string, spans: QuietSpan[]) => quietSpanAt(Date.parse(createdAt), spans) !== null

/** The catch-up for a span: «ទទួលបានប្រាក់ … រៀល» then «… ដុល្លារ» — the totals of its sales; null when none. */
export function catchUpItem(rows: FeedRow[], span: QuietSpan, speed: VoiceSpeed, origin: string, voice: VoiceGender = DEFAULT_VOICE_GENDER): FeedItem | null {
  const sales = rows
    .filter((r) => inQuietSpan(r.created_at, [span]) && !isLatePush(r.transaction_time, r.created_at))
    .map((r) => ({ amount: Number(r.amount), currency: r.currency }))
    .filter((s): s is { amount: number; currency: "KHR" | "USD" } => s.amount > 0 && (s.currency === "KHR" || s.currency === "USD"))
  const totals = catchUpTotals(sales)
  if (!totals.length) return null
  const clips = totals.flatMap((t) => khmerClipSequence(t.amount, t.currency)).map((c) => `${origin}${khmerClipUrl(c, speed, voice)}`)
  return { id: `prayer-${span.to}`, createdAt: new Date(span.to).toISOString(), amount: totals[0].amount, currency: totals[0].currency, clips }
}
