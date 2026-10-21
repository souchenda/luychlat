/**
 * When the daily market bulletins go out (founder, 21/10/2026 — «never publish stale or yesterday's rates»), for
 * @LuyChlatCommunity and @LuyChlatIslamic alike. Pure (bulletin-timing.test.ts).
 *
 *   - Only an NBC rate dated TODAY is ever published — never yesterday's, never the next working day's on a weekend.
 *     (NBC issues the next working day's rate at ~16:30 the day before — lib/server/market-sync.ts — so on a working
 *     day today's rate is usually in by 08:00; the gold shops publish ~09:00.)
 *   - From 08:00 the app checks every 5 minutes; the bulletin goes out the moment today's NBC rate AND today's Phnom
 *     Penh gold are both in.
 *   - 10:00: today's NBC rate is in but not today's gold → published, the gold labelled with its own date (never passed
 *     off as today's). No NBC rate for today by 10:00 (a bank holiday, NBC late) → held; on a weekday the founder is
 *     told once. A server down at 10:00 still catches up until 11:00 (a missed window is caught up, not skipped).
 */

export const BULLETIN_FROM = 8 * 60
export const BULLETIN_DEADLINE = 10 * 60
export const BULLETIN_LAST = 11 * 60
/** How often NBC is asked while today's rate is not in. */
export const NBC_POLL_MS = 5 * 60_000

/** An NBC rate is fresh only on its own day. */
export const nbcFresh = (nbcDate: string | null | undefined, today: string) => Boolean(nbcDate) && nbcDate === today

export type BulletinDecision = "closed" | "wait" | "publish" | "hold"

/**
 * closed — outside 08:00–11:00; wait — keep checking; publish — now; hold — no NBC rate for today by 10:00 (never
 * published that day).
 */
export function bulletinDecision(o: { minutes: number; today: string; nbcDate: string | null | undefined; goldDate: string | null | undefined }): BulletinDecision {
  if (o.minutes < BULLETIN_FROM || o.minutes >= BULLETIN_LAST) return "closed"
  const fresh = nbcFresh(o.nbcDate, o.today)
  if (o.minutes >= BULLETIN_DEADLINE) return fresh ? "publish" : "hold"
  return fresh && o.goldDate === o.today ? "publish" : "wait"
}

/**
 * Whether to fetch again now: in the window, today's NBC rate or today's gold not yet in, and the last fetch at least 5
 * minutes ago (the bulletin goes out the minute both are in).
 */
export function shouldPollMarket(o: { minutes: number; today: string; nbcDate: string | null | undefined; goldDate: string | null | undefined; lastPollAt: number; now: number }): boolean {
  if (o.minutes < BULLETIN_FROM || o.minutes >= BULLETIN_DEADLINE) return false
  const complete = nbcFresh(o.nbcDate, o.today) && o.goldDate === o.today
  return !complete && o.now - o.lastPollAt >= NBC_POLL_MS
}

/** Monday–Friday (a held weekday is worth telling the founder; a weekend never has a rate of its own). */
export const isWeekday = (day: string) => ![0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())

/** The founder's note when a weekday's bulletin is held. */
export const HELD_NOTE =
  "⏸️ ព្រឹត្តិបត្រទីផ្សារថ្ងៃនេះមិនបានផ្សាយទេ — ធនាគារជាតិ (NBC) មិនទាន់ចេញអត្រាសម្រាប់ថ្ងៃនេះ រហូតដល់ម៉ោង ១០:០០ (ថ្ងៃឈប់សម្រាករបស់ធនាគារ?)។ មិនផ្សាយអត្រាចាស់ជំនួសទេ។"
