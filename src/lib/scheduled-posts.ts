/**
 * Preview-first channel posts, published ONLY with the founder's approval (founder, 18/10/2026 — the
 * auto-publish fallback of 12/10 is gone: an unvetted quote went public). 45 minutes before the 07:00
 * poster, a holiday note or a fuel price change, the founder gets a preview — where it will go, the
 * poster or text, [ ✅ យល់ព្រម ] (published at its time), [ 🚀 ផុសភ្លាមៗ ] (now) and [ ❌ ផ្អាក ].
 * No tap → it is never published (on hold, expired 90 minutes after its time). The database enforces
 * it too: the timer can only publish a post the founder approved (bot_post_take). Pure
 * (scheduled-posts.test.ts); the bot side is lib/server/scheduled-posts.ts.
 */
import { khmerDigits } from "@/lib/dates"
import { HOLIDAY_POST_MINUTE, HOLIDAY_PRE_MINUTE, holidayMoment } from "@/lib/holiday-lifecycle"
import { SPOTLIGHT } from "@/lib/spotlight"
import { DILEMMA_MINUTE, DILEMMA_WEEKDAYS } from "@/lib/money-dilemmas"
import * as G from "@/lib/islamic/glossary"
import { toHijri, type HijriDate } from "@/lib/islamic"
import { dateOf, islamicPlannedPosts, type IslamicKind } from "@/lib/islamic-channel"

/**
 * Every public post (founder, 18/10/2026 — none without approval): the 07:00 poster, holiday notes, fuel
 * notices, the 20:00 reminder, the Saturday spotlight, the market bulletin, the evening NBC rates,
 * festival posters and holy-day notes.
 */
export type PostKind = "MORNING" | "HOLIDAY" | "FUEL" | "EVENING" | "SPOTLIGHT" | "BULLETIN" | "RATES" | "POSTER" | "HOLYDAY" | "DILEMMA" | IslamicKind
/** `channel`: which Telegram channel (lib/islamic-channel.ts channelFor) — the general one unless said. */
export type Targets = { telegram: boolean; facebook: boolean; channel?: "community" | "islamic" }
export type PostStatus = "PENDING" | "APPROVED" | "PUBLISHED" | "PAUSED" | "EXPIRED"

/** The preview goes out this long before the post. */
export const PREVIEW_LEAD_MIN = 45
/** A post more than this late is never sent (a server down all morning must not post at noon). */
export const LATE_LIMIT_MIN = 90
/** A fuel price change: preview on detection, published this long after. */
export const FUEL_DELAY_MIN = 45

export const MORNING_POST_MINUTE = 7 * 60
/** The 20:00 check-in in the channel. */
export const EVENING_POST_MINUTE = 20 * 60
/** An event-driven post (the bulletin, festival posters…): previewed at once, publishable from this many minutes on. */
export const EVENT_LEAD_MIN = 1

/** The 07:00 post as Cambodia-time ISO for `day` + `minute`. */
export const atMinute = (day: string, minute: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + minute * 60_000).toISOString()

/** The posts whose preview window is open at this Cambodian minute: from 45 min before until 90 min after. */
export function plannedPosts(day: string, minutes: number): { kind: PostKind; postKey: string; publishMinute: number; payload: Record<string, string> }[] {
  const open = (at: number) => minutes >= at - PREVIEW_LEAD_MIN && minutes < at + LATE_LIMIT_MIN
  const out: { kind: PostKind; postKey: string; publishMinute: number; payload: Record<string, string> }[] = []
  if (open(MORNING_POST_MINUTE)) out.push({ kind: "MORNING", postKey: day, publishMinute: MORNING_POST_MINUTE, payload: { day } })
  if (open(EVENING_POST_MINUTE)) out.push({ kind: "EVENING", postKey: day, publishMinute: EVENING_POST_MINUTE, payload: { day } })
  // Tuesday / Friday 18:30: a money dilemma for the community and the Facebook Page (founder, 18/10/2026).
  if (DILEMMA_WEEKDAYS.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && open(DILEMMA_MINUTE))
    out.push({ kind: "DILEMMA", postKey: day, publishMinute: DILEMMA_MINUTE, payload: { day } })
  if (new Date(`${day}T00:00:00Z`).getUTCDay() === SPOTLIGHT.weekday && open(SPOTLIGHT.from))
    out.push({ kind: "SPOTLIGHT", postKey: day, publishMinute: SPOTLIGHT.from, payload: { day } })
  const m = holidayMoment(day)
  if (m) {
    const at = m.stage === "pre" ? HOLIDAY_PRE_MINUTE : HOLIDAY_POST_MINUTE
    if (open(at)) out.push({ kind: "HOLIDAY", postKey: `${day}-${m.stage}`, publishMinute: at, payload: { day, stage: m.stage } })
  }
  return out
}

/** The Islamic channel's posts (@LuyChlatIslamic) — planned apart from the general ones, same window, same approval gate. */
export function plannedIslamicPosts(day: string, minutes: number, hijriOf: (day: string) => HijriDate | null = (d) => toHijri(dateOf(d))) {
  return islamicPlannedPosts(day, hijriOf, (at) => minutes >= at - PREVIEW_LEAD_MIN && minutes < at + LATE_LIMIT_MIN, minutes)
}

/**
 * What the timer does: not yet; publish — ONLY a post the founder approved; hold — its time has come
 * but nobody approved it (never published by the timer); or too late (expired, never posted).
 */
export function dueAction(publishAt: string, now: number, status: PostStatus): "wait" | "publish" | "hold" | "expire" {
  const t = Date.parse(publishAt)
  if (now < t) return "wait"
  if (now - t > LATE_LIMIT_MIN * 60_000) return "expire"
  return status === "APPROVED" ? "publish" : "hold"
}

/** «✈️ Telegram Channel + 🔵 Facebook Page» / «… តែប៉ុណ្ណោះ». */
export function targetLabel(t: Targets): string {
  if (t.channel === "islamic") return t.telegram ? "✈️ Telegram Channel ឥស្លាម (@LuyChlatIslamic) តែប៉ុណ្ណោះ" : "គ្មានគោលដៅ (មិនទាន់កំណត់ Channel ឥស្លាម)"
  if (t.telegram && t.facebook) return "✈️ Telegram Channel + 🔵 Facebook Page"
  if (t.telegram) return "✈️ Telegram Channel តែប៉ុណ្ណោះ"
  if (t.facebook) return "🔵 Facebook Page តែប៉ុណ្ណោះ"
  return "គ្មានគោលដៅ (មិនទាន់កំណត់ Telegram Channel ឬ Facebook Page)"
}

/** «០៧:០០ ព្រឹក» / «១៨:០០ ល្ងាច» from a Cambodia-time instant. */
export function kmClock(iso: string): string {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000)
  const h = t.getUTCHours()
  const m = t.getUTCMinutes()
  const part = h < 12 ? "ព្រឹក" : h < 17 ? "រសៀល" : "ល្ងាច"
  return `${khmerDigits(String(h).padStart(2, "0"))}:${khmerDigits(String(m).padStart(2, "0"))} ${part}`
}

const KIND_LABEL: Record<PostKind, string> = {
  MORNING: "ផុសព្រឹក (Poster)",
  HOLIDAY: "សារថ្ងៃឈប់សម្រាក",
  FUEL: "តម្លៃប្រេងថ្មី",
  EVENING: "សាររំលឹកម៉ោង ៨ យប់",
  SPOTLIGHT: "តម្លៃស្នូលប្រចាំសប្តាហ៍ (Poster)",
  BULLETIN: "ព្រឹត្តិបត្រទីផ្សារ (NBC · មាស · ប្រេង)",
  RATES: "អត្រាប្តូរប្រាក់ NBC ពេលល្ងាច",
  POSTER: "Poster ពិធីបុណ្យ",
  HOLYDAY: "សារថ្ងៃសីល",
  DILEMMA: "សំណួរហិរញ្ញវត្ថុពិភាក្សា (Money Dilemma)",
  ISLAMIC_DAILY: "ហ៊ីជរី និងមេរៀនហិរញ្ញវត្ថុហាឡាល់",
  ISLAMIC_FAST: "រំលឹកបួសស៊ុណ្ណះ (ច័ន្ទ / ព្រហស្បតិ៍)",
  ISLAMIC_JUMUAH: `${G.JUMUAH} (ថ្ងៃសុក្រ)`,
  ISLAMIC_QUIZ: "ល្បងប្រាជ្ញាច្បាប់សាសនា (Quiz ក្នុងអេប)",
  ISLAMIC_MORNING: "ឌុអាពេលព្រឹក និងម៉ោងថ្វាយបង្គំ",
  ISLAMIC_IFTAR: `ឌុអា${G.IFTAR}`,
  ISLAMIC_NIGHT: "ឌុអាមុនចូលគេង",
}

/**
 * Factual feeds publish on time without a tap (founder, 19/10/2026): the market bulletin (NBC rates, gold, fuel),
 * the evening NBC rates and the 05:30 prayer times with the waking du'a — Telegram only, zero brand risk. The
 * database creates them APPROVED (public.post_auto_publish — the same list, compared in scheduled-posts.test.ts)
 * and they publish silently: no preview reaches the approval room (founder, 19/10/2026). Everything else waits for
 * the founder's ✅ / 🚀.
 */
export const AUTO_PUBLISH_KINDS: readonly PostKind[] = ["BULLETIN", "RATES", "ISLAMIC_MORNING"]
export const isAutoPublish = (kind: string) => (AUTO_PUBLISH_KINDS as readonly string[]).includes(kind)

/** The preview's header (destination first), the post itself, then the status line. */
export function previewText(o: { kind: PostKind; targets: Targets; publishAt: string; body: string; status: PostStatus; decider?: Decider | null }): string {
  const where = targetLabel(o.targets)
  return [
    `📢 គោលដៅផ្សាយ៖ [ ${where} ]`,
    `👀 មើលជាមុន · ${KIND_LABEL[o.kind]}`,
    "",
    o.body,
    "",
    (o.decider && deciderLine(o.status, where, o.publishAt, o.decider)) ?? statusLine(o.status, where, o.publishAt),
  ].join("\n")
}

/** Who tapped ✅ / 🚀 / ❌ and when (scheduled_posts.decided_name / decided_username / decided_at / decided_how). */
export type Decider = { name: string | null; username: string | null; at: string | null; how: "approve" | "publish" | "pause" | null }

/** «{name} (@{username})» — the Telegram name, with the @username when there is one. */
export function deciderName(d: Pick<Decider, "name" | "username">): string {
  const name = d.name?.trim()
  if (name && d.username) return `${name} (@${d.username})`
  return name || (d.username ? `@${d.username}` : "—")
}

/**
 * The card once someone decided (founder, 20/10/2026): their name and the time, in «LCA Approval» for every
 * approver to see. Null when nobody is named (the timer's expiry, an older post) — the plain status line then.
 */
export function deciderLine(status: PostStatus, where: string, publishAt: string, d: Decider): string | null {
  if (!d.how || !d.at || (!d.name?.trim() && !d.username)) return null
  const who = `👤 ${deciderName(d)}`
  const at = kmClock(d.at)
  if (status === "APPROVED" && d.how === "approve")
    return [`✅ បានយល់ព្រមដោយ៖ ${who}`, `⏰ ម៉ោងអនុម័ត៖ ${at}`, `📢 នឹងផ្សាយទៅ [ ${where} ] នៅម៉ោង ${kmClock(publishAt)}។`].join("\n")
  if (status === "PUBLISHED" && d.how === "publish") return [`🚀 បានបាញ់ផ្សាយភ្លាមៗដោយ៖ ${who}`, `⏰ ម៉ោងផ្សាយ៖ ${at}`].join("\n")
  if (status === "PUBLISHED" && d.how === "approve") return [`✅ បានផ្សាយរួចរាល់ នៅម៉ោង ${kmClock(publishAt)}`, `${who} បានយល់ព្រម · ⏰ ${at}`].join("\n")
  if (status === "PAUSED" && d.how === "pause") return [`❌ ត្រូវបានផ្អាកដោយ៖ ${who}`, `⏰ ម៉ោងផ្អាក៖ ${at}`].join("\n")
  return null
}

export function statusLine(status: PostStatus, where: string, publishAt: string): string {
  switch (status) {
    case "PENDING":
      return `🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម — ចុច «✅ យល់ព្រម» ដើម្បីផ្សាយទៅ [ ${where} ] នៅម៉ោង ${kmClock(publishAt)}។`
    case "APPROVED":
      return `✅ បានយល់ព្រម — នឹងផ្សាយទៅ [ ${where} ] នៅម៉ោង ${kmClock(publishAt)}។`
    case "PUBLISHED":
      return "✅ បានផ្សាយរួចរាល់"
    case "PAUSED":
      return "❌ បានផ្អាកការផ្សាយថ្ងៃនេះ"
    case "EXPIRED":
      return "⌛ មិនបានផ្សាយ — គ្មានការយល់ព្រមទាន់ពេល"
  }
}

/**
 * Humour and video posts (founder, 18/10/2026): the founder guards their tone in comedy and religion — previewed
 * like every post, never published without the founder's ✅ / 🚀, and their ❌ reads «ផ្អាក / បដិសេធ» (hold or reject).
 */
export const COMEDY_KINDS: readonly string[] = ["DILEMMA"]

/**
 * Pending: [ ✅ យល់ព្រម ] (published at its time), [ 🚀 ផុសភ្លាមៗ ] (now) and [ ❌ ផ្អាក ]. Approved: publish now
 * or pause. Nothing once it has been published, paused or expired.
 */
export function previewButtons(id: number, status: PostStatus, targets: Targets, kind?: string): { text: string; callback_data: string }[][] {
  if (status !== "PENDING" && status !== "APPROVED") return []
  const short = targets.telegram && targets.facebook ? "Telegram + Facebook" : targets.facebook ? "Facebook" : "Telegram"
  return [
    ...(status === "PENDING" ? [[{ text: "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)", callback_data: `sp:${id}:a` }]] : []),
    [{ text: `🚀 ផុសភ្លាមៗ (${short})`, callback_data: `sp:${id}:p` }],
    [{ text: kind && COMEDY_KINDS.includes(kind) ? "❌ ផ្អាក / បដិសេធ" : "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }],
  ]
}

export const isScheduledPostCallback = (data: string | undefined) => Boolean(data && /^sp:\d+:[pxa]$/.test(data))
export function parseScheduledPostCallback(data: string | undefined): { id: number; action: "publish" | "pause" | "approve" } | null {
  const m = /^sp:(\d+):([pxa])$/.exec(data ?? "")
  return m ? { id: Number(m[1]), action: m[2] === "p" ? "publish" : m[2] === "a" ? "approve" : "pause" } : null
}

/**
 * Which state change is allowed — the same rule as the database's bot_post_take (founder, 18/10/2026):
 * the founder (a super admin's tap) approves, publishes now or pauses a pending or approved post; the
 * timer publishes ONLY an approved one and expires what is left. Nothing leaves PUBLISHED, PAUSED or
 * EXPIRED.
 */
export function takeAllowed(from: PostStatus, to: Exclude<PostStatus, "PENDING">, byFounder: boolean): boolean {
  if (to === "APPROVED") return byFounder && from === "PENDING"
  if (to === "PUBLISHED") return byFounder ? from === "PENDING" || from === "APPROVED" : from === "APPROVED"
  if (to === "PAUSED") return byFounder && (from === "PENDING" || from === "APPROVED")
  return !byFounder && (from === "PENDING" || from === "APPROVED")
}
