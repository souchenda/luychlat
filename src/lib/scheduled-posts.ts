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
export type PostKind = "MORNING" | "HOLIDAY" | "FUEL" | "EVENING" | "SPOTLIGHT" | "BULLETIN" | "RATES" | "POSTER" | "HOLYDAY" | "DILEMMA" | "ISLAMIC_BULLETIN" | "NATIONAL_DAY" | IslamicKind
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

/** A 05:00 holiday note's preview the evening before (founder, 20/10/2026). */
export const HOLIDAY_EVENING_PREVIEW_MINUTE = 21 * 60 + 30

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
  // A 05:00 holiday note is previewed the evening before, from 21:30 (the founder approves before bed — as the
  // 05:30 Islamic post); published at 05:00 once approved.
  if (minutes >= HOLIDAY_EVENING_PREVIEW_MINUTE) {
    const tomorrow = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    const next = holidayMoment(tomorrow)
    if (next) {
      const at = next.stage === "pre" ? HOLIDAY_PRE_MINUTE : HOLIDAY_POST_MINUTE
      out.push({ kind: "HOLIDAY", postKey: `${tomorrow}-${next.stage}`, publishMinute: 24 * 60 + at, payload: { day: tomorrow, stage: next.stage } })
    }
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
  // An approved post the server could not send within 90 minutes is not posted hours late.
  if (status === "APPROVED") return now - t > LATE_LIMIT_MIN * 60_000 ? "expire" : "publish"
  // ZERO UNAPPROVED PUBLIC POSTS (founder, 20/10/2026): silence = HOLD — never published by the timer; it waits for
  // the founder's tap (urgent reminders) until the end of its day in Cambodia, then expires unpublished.
  return now >= endOfCambodiaDay(t) ? "expire" : "hold"
}

/** Midnight after the instant's Cambodia day (UTC+7). */
export const endOfCambodiaDay = (t: number) => {
  const day = new Date(t + 7 * 3_600_000).toISOString().slice(0, 10)
  return Date.parse(`${day}T00:00:00Z`) + 86_400_000 - 7 * 3_600_000
}

/**
 * The founder's urgent reminders for a post still waiting at its time (founder, 20/10/2026): the first at its time,
 * the second an hour later. 0 before its time.
 */
export const reminderLevel = (publishAt: string, now: number): 0 | 1 | 2 => {
  const late = now - Date.parse(publishAt)
  return late < 0 ? 0 : late < 60 * 60_000 ? 1 : 2
}

/** The urgent reminder in the founder's private chat — what, when, and that nobody in «LCA Approval» decided. */
export function urgentReminderText(o: { kind: PostKind; title: string; publishAt: string; level: 1 | 2 }): string {
  return [
    o.level === 1 ? "🚨 ការក្រើនរំលឹកជាបន្ទាន់៖ ដល់ម៉ោងផ្សាយហើយ!" : "🚨 ការក្រើនរំលឹកលើកទី ២៖ ការផ្សាយនៅតែរង់ចាំបង!",
    `• មាតិកា៖ ${KIND_LABEL[o.kind]}${o.title ? ` — ${o.title}` : ""}`,
    `• ម៉ោងគ្រោងទុក៖ ${kmClock(o.publishAt)}`,
    "• ស្ថានភាព៖ មិនទាន់មានការសម្រេចចិត្តពីអេដមីនឡើយ!",
    "",
    "មិនទាន់ផ្សាយទេ — នៅរង់ចាំការសម្រេចរបស់បង។ សូមបងពិនិត្យ និងចុចសម្រេចចិត្តខាងក្រោម៖",
  ].join("\n")
}

/** [ ✅ អនុម័ត និងផ្សាយឥឡូវនេះ ] (publishes now — the founder's 🚀) and [ ❌ ផ្អាកថ្ងៃនេះ ]. */
export const urgentReminderButtons = (id: number) => [
  [{ text: "✅ អនុម័ត និងផ្សាយឥឡូវនេះ", callback_data: `sp:${id}:p` }],
  [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }],
]

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

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const cambodiaDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)

/** «២៩ តុលា» — the Cambodian calendar day of an instant. */
export function kmDayMonth(iso: string): string {
  const [, m, d] = cambodiaDay(iso).split("-").map(Number)
  return `${khmerDigits(String(d))} ${KM_MONTHS[m - 1]}`
}

/**
 * When a post goes out, with no ambiguity (founder, 20/10/2026 — «does approving now publish tomorrow or on the 29th?»):
 * «ម៉ោង ០៧:០០ ព្រឹក» the same day; «ថ្ងៃទី ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក» when it publishes on a later day than `now`.
 */
export function kmWhen(publishAt: string, now?: string): string {
  const later = now !== undefined && cambodiaDay(publishAt) !== cambodiaDay(now)
  return later ? `ថ្ងៃទី ${kmDayMonth(publishAt)} ម៉ោង ${kmClock(publishAt)}` : `ម៉ោង ${kmClock(publishAt)}`
}

const KIND_LABEL: Record<PostKind, string> = {
  MORNING: "ផុសព្រឹក (Poster)",
  HOLIDAY: "សារថ្ងៃឈប់សម្រាក",
  FUEL: "តម្លៃប្រេងថ្មី",
  EVENING: "សាររំលឹកម៉ោង ៨ យប់",
  SPOTLIGHT: "តម្លៃស្នូលប្រចាំសប្តាហ៍ (Poster)",
  BULLETIN: "ព្រឹត្តិបត្រទីផ្សារ (NBC · មាស · ប្រេង)",
  RATES: "អត្រាប្តូរប្រាក់ NBC ពេលល្ងាច",
  ISLAMIC_BULLETIN: "ព្រឹត្តិបត្រហាងឆេង SAR និងនីស៊បមាសហ្សាកាត់ (Channel ឥស្លាម)",
  NATIONAL_DAY: "ទិវាជាតិ / ព្រះរាជពិធី (Poster) — សូមពិនិត្យរាជស័ព្ទមុនអនុម័ត",
  POSTER: "Poster ពិធីបុណ្យ",
  HOLYDAY: "សារថ្ងៃសីល",
  DILEMMA: "សំណួរហិរញ្ញវត្ថុពិភាក្សា (Money Dilemma)",
  ISLAMIC_DAILY: "ហ៊ីជរី និងមេរៀនហិរញ្ញវត្ថុហាឡាល់",
  ISLAMIC_FAST: "រំលឹកបួសស៊ុណ្ណះ (ច័ន្ទ / ព្រហស្បតិ៍)",
  ISLAMIC_JUMUAH: `${G.JUMUAH} (ថ្ងៃសុក្រ)`,
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
// The Islamic market bulletin (NBC, SAR, gold, the Zakat Nisab — founder, 20/10/2026) is factual too: @LuyChlatIslamic only.
export const AUTO_PUBLISH_KINDS: readonly PostKind[] = ["BULLETIN", "RATES", "ISLAMIC_MORNING", "ISLAMIC_BULLETIN"]
export const isAutoPublish = (kind: string) => (AUTO_PUBLISH_KINDS as readonly string[]).includes(kind)

/**
 * Auto-published, yet previewed — the safety net (founder, 21/10/2026): the 05:30 prayer times with the waking du'a stay
 * on the whitelist (nobody wakes at 05:00 to tap), and their card still reaches «LCA Approval» the evening before, from
 * 21:30, with [ ❌ ផ្អាកថ្ងៃនេះ ] only (no 🚀 at night) and caption editing by reply. Silence = it publishes on time.
 * The other factual feeds (the bulletin, the NBC rates) stay silent.
 */
export const SAFETY_NET_KINDS: readonly PostKind[] = ["ISLAMIC_MORNING"]
export const isSafetyNet = (kind: string) => (SAFETY_NET_KINDS as readonly string[]).includes(kind)

/** A card goes to the approval room for a post that waits for a tap, or an auto-published post with a safety net. */
export const isPreviewed = (kind: string, status: PostStatus) => (status === "PENDING" && !isAutoPublish(kind)) || (status === "APPROVED" && isSafetyNet(kind))

/** The preview's header (destination first), the post itself, then the status line. */
export function previewText(o: { kind: PostKind; targets: Targets; publishAt: string; body: string; status: PostStatus; decider?: Decider | null; now?: string }): string {
  const where = targetLabel(o.targets)
  return [
    `📢 គោលដៅផ្សាយ៖ [ ${where} ]`,
    `👀 មើលជាមុន · ${KIND_LABEL[o.kind]}`,
    "",
    o.body,
    "",
    (o.decider && deciderLine(o.status, where, o.publishAt, o.decider, o.now)) ??
      (o.status === "APPROVED" && isSafetyNet(o.kind) ? safetyNetLine(where, o.publishAt, o.now) : statusLine(o.status, where, o.publishAt, o.now)),
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
export function deciderLine(status: PostStatus, where: string, publishAt: string, d: Decider, now?: string): string | null {
  if (!d.how || !d.at || (!d.name?.trim() && !d.username)) return null
  const who = `👤 ${deciderName(d)}`
  const at = kmClock(d.at)
  if (status === "APPROVED" && d.how === "approve")
    return [`✅ បានយល់ព្រមដោយ៖ ${who}`, `⏰ ម៉ោងអនុម័ត៖ ${at}`, `📢 នឹងផ្សាយទៅ [ ${where} ] នៅ${kmWhen(publishAt, now)}។`].join("\n")
  if (status === "PUBLISHED" && d.how === "publish") return [`🚀 បានបាញ់ផ្សាយភ្លាមៗដោយ៖ ${who}`, `⏰ ម៉ោងផ្សាយ៖ ${at}`].join("\n")
  if (status === "PUBLISHED" && d.how === "approve") return [`✅ បានផ្សាយរួចរាល់ នៅម៉ោង ${kmClock(publishAt)}`, `${who} បានយល់ព្រម · ⏰ ${at}`].join("\n")
  if (status === "PAUSED" && d.how === "pause") return [`❌ ត្រូវបានផ្អាកដោយ៖ ${who}`, `⏰ ម៉ោងផ្អាក៖ ${at}`].join("\n")
  return null
}

/** The safety-net card's status: it publishes by itself; ❌ pauses it, a reply edits it. */
export function safetyNetLine(where: string, publishAt: string, now?: string): string {
  return [
    `🤖 ព័ត៌មានស្វ័យប្រវត្តិ — នឹងផ្សាយទៅ [ ${where} ] នៅ${kmWhen(publishAt, now)} ដោយមិនចាំបាច់ចុច។`,
    "❌ ចុចផ្អាក ប្រសិនបើមានកំហុស · ✏️ Reply លើកាតនេះ ដើម្បីកែអត្ថបទ។",
  ].join("\n")
}

export function statusLine(status: PostStatus, where: string, publishAt: string, now?: string): string {
  switch (status) {
    case "PENDING":
      return `🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម — ចុច «✅ យល់ព្រម» ដើម្បីផ្សាយទៅ [ ${where} ] នៅ${kmWhen(publishAt, now)}។`
    case "APPROVED":
      return `✅ បានយល់ព្រម — នឹងផ្សាយទៅ [ ${where} ] នៅ${kmWhen(publishAt, now)}។`
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
export function previewButtons(id: number, status: PostStatus, targets: Targets, kind?: string, when?: { publishAt: string; now: string }): { text: string; callback_data: string }[][] {
  if (status !== "PENDING" && status !== "APPROVED") return []
  // The safety net (05:30): only ❌ — it publishes by itself, and a 🚀 at 21:30 would post it in the night.
  if (status === "APPROVED" && kind && isSafetyNet(kind)) return [[{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }]]
  const short = targets.telegram && targets.facebook ? "Telegram + Facebook" : targets.facebook ? "Facebook" : "Telegram"
  return [
    // A later day is named on the button itself (founder, 20/10/2026): «✅ យល់ព្រម (ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក)».
    // Its time already passed (a held post): ✅ publishes at once (lib/server/scheduled-posts.ts onCallback, 21/10/2026).
    ...(status === "PENDING"
      ? [[{ text: when && Date.parse(when.now) >= Date.parse(when.publishAt) ? "✅ យល់ព្រម និងផ្សាយឥឡូវនេះ" : when && kmWhen(when.publishAt, when.now).startsWith("ថ្ងៃទី") ? `✅ យល់ព្រម (ផ្សាយថ្ងៃ ${kmDayMonth(when.publishAt)} ម៉ោង ${kmClock(when.publishAt)})` : "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)", callback_data: `sp:${id}:a` }]]
      : []),
    [{ text: `🚀 ផុសភ្លាមៗ (${short})`, callback_data: `sp:${id}:p` }],
    [{ text: kind && COMEDY_KINDS.includes(kind) ? "❌ ផ្អាក / បដិសេធ" : "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }],
  ]
}

export const isScheduledPostCallback = (data: string | undefined) => Boolean(data && (/^sp:\d+:[pxa]$/.test(data) || isReplaceCallback(data)))

// ─── REPLACE OLD WITH NEW (founder, 20/10/2026) ───────────────────────────────────────────────────────────────────
// A post published today whose content has since been improved: the new version is previewed in «LCA Approval»; on
// [ 🔄 ] it is published and the old message deleted (lib/server/scheduled-posts.ts, migration 20270200000000).

/** Kinds whose content is fixed by the day (a poster, a lesson, a quote) — a difference means a new version. The live
 *  feeds (bulletin, NBC rates, a fuel notice) change by themselves and are never offered for replacement. Nor is a
 *  retired kind (no longer in KIND_LABEL, e.g. the channel quiz, 20/10/2026): its content is gone, not improved. */
export const REPLACEABLE = (kind: string) => Object.hasOwn(KIND_LABEL, kind) && kind !== "BULLETIN" && kind !== "RATES" && kind !== "FUEL"

export function replacePreviewText(kind: PostKind, body: string): string {
  return [
    `🔄 កំណែថ្មីនៃការផ្សាយថ្ងៃនេះ · ${KIND_LABEL[kind]}`,
    "ការផ្សាយនេះបានចេញរួចហើយ ប៉ុន្តែខ្លឹមសារត្រូវបានកែលម្អ។ ចុច «🔄 ជំនួស» ដើម្បីផ្សាយកំណែថ្មីខាងក្រោម ហើយលុបសារចាស់ចេញ។",
    "",
    body,
  ].join("\n")
}

export const replaceButtons = (id: number) => [
  [{ text: "🔄 ជំនួសដោយកំណែថ្មី", callback_data: `spr:${id}:y` }],
  [{ text: "❌ រក្សាកំណែចាស់", callback_data: `spr:${id}:n` }],
]

export const isReplaceCallback = (data: string | undefined) => Boolean(data && /^spr:\d+:[yn]$/.test(data))
export function parseReplaceCallback(data: string | undefined): { id: number; replace: boolean } | null {
  const m = /^spr:(\d+):([yn])$/.exec(data ?? "")
  return m ? { id: Number(m[1]), replace: m[2] === "y" } : null
}

/** The founder's note once replaced — the old message is gone, the new one is live. */
export function replacedNote(kind: PostKind, postKey: string, ok: { removed: boolean; telegram: number | null }): string {
  return ok.removed
    ? `🔄 បានជំនួសរួចរាល់ · ${KIND_LABEL[kind]} (${postKey})\nកំណែថ្មីបានផ្សាយ ហើយសារចាស់ត្រូវបានលុបចេញពីឆានែល។`
    : `🔄 កំណែថ្មីបានផ្សាយ · ${KIND_LABEL[kind]} (${postKey})\n⚠️ មិនអាចលុបសារចាស់បានទេ — សូមលុបដោយដៃនៅក្នុងឆានែល។`
}
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
