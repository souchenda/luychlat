/**
 * Channel publishing integrity (founder, 21/10/2026 — Task #441, after replaced morning posts reached the channels at
 * night, one after another, each a new notification):
 *   1. a time-bound post is published only in its hours — the morning ones (the 07:00 poster, the 05:30 prayer times and
 *      du'a, the market bulletins) until 11:00, never later; the bedtime ones (the 20:00 reminder, the bedtime du'a)
 *      only from 19:00 to 23:00;
 *   2. a public channel gets at most one broadcast in any 30 minutes — posts ready together are spaced out; only the
 *      founder's own 🚀 («publish now») goes at once;
 *   3. an update to a published post is an edit of that message (silent), never a delete and a new post — see
 *      createScheduler › replaceDue (lib/server/scheduled-posts.ts).
 * Pure; Cambodia time (UTC+7).
 */
export const MORNING_KINDS = ["MORNING", "ISLAMIC_MORNING", "BULLETIN", "ISLAMIC_BULLETIN"] as const
export const BEDTIME_KINDS = ["EVENING", "ISLAMIC_NIGHT"] as const

/** The morning cut-off and the bedtime window, minutes of the Cambodian day. */
export const MORNING_CUTOFF = 11 * 60
export const BEDTIME_FROM = 19 * 60
export const BEDTIME_TO = 23 * 60

/** At most one broadcast per public channel in this many minutes. */
export const CHANNEL_SPACING_MIN = 30

const cambodiaMinute = (ms: number) => {
  const t = new Date(ms + 7 * 3_600_000)
  return t.getUTCHours() * 60 + t.getUTCMinutes()
}

export type WindowVerdict = { ok: true } | { ok: false; reason: "morning" | "bedtime" }

/** May a post of this kind be published (or published again) at `now`? */
export function publishWindow(kind: string, now: number): WindowVerdict {
  const m = cambodiaMinute(now)
  if ((MORNING_KINDS as readonly string[]).includes(kind) && m >= MORNING_CUTOFF) return { ok: false, reason: "morning" }
  if ((BEDTIME_KINDS as readonly string[]).includes(kind) && (m < BEDTIME_FROM || m >= BEDTIME_TO)) return { ok: false, reason: "bedtime" }
  return { ok: true }
}

/** The approver's answer when a tap comes outside the post's hours (the card stays; nothing is published). */
export const windowRefusal = (reason: "morning" | "bedtime") =>
  reason === "morning" ? "⛔ ផុតម៉ោងហើយ — សារពេលព្រឹកផ្សាយបានត្រឹមម៉ោង ១១:០០ ព្រឹក ប៉ុណ្ណោះ។" : "⛔ សារពេលយប់ផ្សាយបានតែចន្លោះម៉ោង ១៩:០០ ដល់ ២៣:០០ ប៉ុណ្ណោះ។"

/** Minutes still to wait before this channel may broadcast again (0 = now), given its last broadcast. */
export function spacingWait(lastBroadcast: number | null, now: number, spacingMin = CHANNEL_SPACING_MIN): number {
  if (lastBroadcast == null) return 0
  const left = lastBroadcast + spacingMin * 60_000 - now
  return left > 0 ? Math.ceil(left / 60_000) : 0
}
