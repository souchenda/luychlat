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

export type PostKind = "MORNING" | "HOLIDAY" | "FUEL"
export type Targets = { telegram: boolean; facebook: boolean }
export type PostStatus = "PENDING" | "APPROVED" | "PUBLISHED" | "PAUSED" | "EXPIRED"

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
 * Pending: [ ✅ យល់ព្រម ] (published at its time), [ 🚀 ផុសភ្លាមៗ ] (now) and [ ❌ ផ្អាក ]. Approved: publish now
 * or pause. Nothing once it has been published, paused or expired.
 */
export function previewButtons(id: number, status: PostStatus, targets: Targets): { text: string; callback_data: string }[][] {
  if (status !== "PENDING" && status !== "APPROVED") return []
  const short = targets.telegram && targets.facebook ? "Telegram + Facebook" : targets.facebook ? "Facebook" : "Telegram"
  return [
    ...(status === "PENDING" ? [[{ text: "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)", callback_data: `sp:${id}:a` }]] : []),
    [{ text: `🚀 ផុសភ្លាមៗ (${short})`, callback_data: `sp:${id}:p` }],
    [{ text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: `sp:${id}:x` }],
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
