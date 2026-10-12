/**
 * Preview-first channel posts with an auto-publish fallback (founder, 12/10/2026): 45 minutes before
 * the 07:00 poster, a holiday note or a fuel price change goes out, the founder gets a preview in
 * their private chat — where it will go (Telegram Channel, Facebook Page or both), the poster or text,
 * [ 🚀 ផុសភ្លាមៗ ] and [ ❌ ផ្អាកថ្ងៃនេះ ]. With no action it publishes at its time. Pure
 * (scheduled-posts.test.ts); the bot side is lib/server/scheduled-posts.ts.
 */
import { khmerDigits } from "@/lib/dates"
import { HOLIDAY_POST_MINUTE, HOLIDAY_PRE_MINUTE, holidayMoment } from "@/lib/holiday-lifecycle"

export type PostKind = "MORNING" | "HOLIDAY" | "FUEL"
export type Targets = { telegram: boolean; facebook: boolean }
export type PostStatus = "PENDING" | "PUBLISHED" | "PAUSED" | "EXPIRED"

/** The preview goes out this long before the post. */
export const PREVIEW_LEAD_MIN = 45
/** A post more than this late is never sent (a server down all morning must not post at noon). */
export const LATE_LIMIT_MIN = 90
/** A fuel price change: preview on detection, published this long after. */
export const FUEL_DELAY_MIN = 45

export const MORNING_POST_MINUTE = 7 * 60

/** The 07:00 post as Cambodia-time ISO for `day` + `minute`. */
export const atMinute = (day: string, minute: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + minute * 60_000).toISOString()

/** The posts whose preview window is open at this Cambodian minute: from 45 min before until 90 min after. */
export function plannedPosts(day: string, minutes: number): { kind: PostKind; postKey: string; publishMinute: number; payload: Record<string, string> }[] {
  const open = (at: number) => minutes >= at - PREVIEW_LEAD_MIN && minutes < at + LATE_LIMIT_MIN
  const out: { kind: PostKind; postKey: string; publishMinute: number; payload: Record<string, string> }[] = []
  if (open(MORNING_POST_MINUTE)) out.push({ kind: "MORNING", postKey: day, publishMinute: MORNING_POST_MINUTE, payload: { day } })
  const m = holidayMoment(day)
  if (m) {
    const at = m.stage === "pre" ? HOLIDAY_PRE_MINUTE : HOLIDAY_POST_MINUTE
    if (open(at)) out.push({ kind: "HOLIDAY", postKey: `${day}-${m.stage}`, publishMinute: at, payload: { day, stage: m.stage } })
  }
  return out
}

/** What the timer does with a pending post: not yet, publish now, or too late (never posted). */
export function dueAction(publishAt: string, now: number): "wait" | "publish" | "expire" {
  const t = Date.parse(publishAt)
  if (now < t) return "wait"
  return now - t > LATE_LIMIT_MIN * 60_000 ? "expire" : "publish"
}

/** «✈️ Telegram Channel + 🔵 Facebook Page» / «… តែប៉ុណ្ណោះ». */
export function targetLabel(t: Targets): string {
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

const KIND_LABEL: Record<PostKind, string> = { MORNING: "ផុសព្រឹក (Poster)", HOLIDAY: "សារថ្ងៃឈប់សម្រាក", FUEL: "តម្លៃប្រេងថ្មី" }

/** The preview's header (destination first), the post itself, then the status line. */
export function previewText(o: { kind: PostKind; targets: Targets; publishAt: string; body: string; status: PostStatus }): string {
  const where = targetLabel(o.targets)
  return [
    `📢 គោលដៅផ្សាយ៖ [ ${where} ]`,
    `👀 មើលជាមុន · ${KIND_LABEL[o.kind]}`,
    "",
    o.body,
    "",
    statusLine(o.status, where, o.publishAt),
  ].join("\n")
}

export function statusLine(status: PostStatus, where: string, publishAt: string): string {
  switch (status) {
    case "PENDING":
      return `⏰ នឹងផ្សាយស្វ័យប្រវត្តិទៅកាន់ [ ${where} ] នៅម៉ោង ${kmClock(publishAt)} ប្រសិនបើគ្មានសកម្មភាព។`
    case "PUBLISHED":
      return "✅ បានផ្សាយរួចរាល់"
    case "PAUSED":
      return "❌ បានផ្អាកការផ្សាយថ្ងៃនេះ"
    case "EXPIRED":
      return "⌛ ផុតពេល — មិនបានផ្សាយ"
  }
}

/** The publish button names its destination; both buttons only while pending. */
export function previewButtons(id: number, status: PostStatus, targets: Targets): { text: string; callback_data: string }[][] {
  if (status !== "PENDING") return []
  const short = targets.telegram && targets.facebook ? "Telegram + Facebook" : targets.facebook ? "Facebook" : "Telegram"
  return [[{ text: `🚀 ផុសភ្លាមៗ (${short})`, callback_data: `sp:${id}:p` }], [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }]]
}

export const isScheduledPostCallback = (data: string | undefined) => Boolean(data && /^sp:\d+:[px]$/.test(data))
export function parseScheduledPostCallback(data: string | undefined): { id: number; action: "publish" | "pause" } | null {
  const m = /^sp:(\d+):([px])$/.exec(data ?? "")
  return m ? { id: Number(m[1]), action: m[2] === "p" ? "publish" : "pause" } : null
}
