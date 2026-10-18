// Server only: the community channel's daily routine around the 09:30 market
// bulletin (community-bulletin.ts):
//
//   07:00  ☀️ morning: a short motivation (no tip — tips go out at 12:00, and
//          only after the Super Admin approves them: tip-bot.ts); the same quote
//          goes to subscribed phones as a push notification (web-push.ts) and is
//          the morning card in the app's bell (src/lib/morning.ts)
//   09:30  📊 market bulletin (community-bulletin.ts)
//   20:00  🌙 evening check-in: three short lines, a different one each weekday
//          (lib/evening-reminder.ts) — in the channel, and as
//          a gentle nudge in the bot to users who switched it on (Settings ›
//          Official bot) and recorded nothing today
//
// Each runs once a day (bot_claim_daily, also across restarts), inside a short
// window so a late server start still sends it — never hours late. These posts
// are plain messages: they don't replace (or get replaced by) the market posts.
import { appUrl } from "@/lib/server/community-bulletin"
import { tipPoster } from "@/lib/server/tip-poster"
import { logEvent } from "@/lib/server/events"
import { eveningHtml } from "@/lib/evening-reminder"
import { morningQuote } from "@/lib/morning"
import { facebookMorningCaption, publishLogged, publishPhotoToFacebook } from "@/lib/server/facebook-publisher"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, sendText, tr } from "@/lib/server/telegram-bot"
import type { Locale } from "@/lib/i18n/dictionaries"
import type { FounderApproval } from "@/lib/server/channel"

const MORNING = { job: "community-morning", from: 7 * 60, until: 8 * 60 + 30 }
const EVENING = { job: "community-evening", from: 20 * 60, until: 21 * 60 + 30 }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")


/** 07:00 — title and the core quote (Telegram HTML). The tip goes out at 12:00, approved first (tip-bot.ts). */
export function morningText(day: string): string {
  return [
    "☀️ <b>អរុណសួស្តីថ្ងៃថ្មី · ថាមពលហិរញ្ញវត្ថុ</b>",
    "",
    // Never italic: Khmer script distorts when slanted (founder, 18/10/2026).
    esc(`«${morningQuote(day)}»`),
    "",
    "— អេប លុយឆ្លាត",
  ].join("\n")
}

/** 20:00 — the end-of-day check-in (Telegram HTML): three short lines, a different one each weekday. */
export const eveningText = (day: string) => eveningHtml(day)

/** The morning quote on the v3 poster frame (same design as the daily tip, its own tag). */
export function morningPoster(day: string): Buffer {
  // The poster's fonts have no emoji: the hook and the tip are already two lines there.
  const quote = morningQuote(day).replace(/\s*💡\s*/u, " ")
  return tipPoster({ title: "អរុណសួស្តីថ្ងៃថ្មី", body: quote }, day, { tag: "ថាមពលហិរញ្ញវត្ថុពេលព្រឹក" })
}

/** Once a day inside the window: claim it, then send. */
async function claim(job: string, day: string) {
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  return data === true
}

/** The bot's own nudge, in each user's language, to those who asked for it and haven't recorded today. */
async function nudgeSubscribers(day: string) {
  const { data, error } = await botDb().rpc("bot_evening_checkin_subscribers", { p_key: botKey() })
  if (error) {
    logEvent("error", "routine", `Evening check-in subscribers failed: ${error.message}`, { fold: true })
    return 0
  }
  const url = await appUrl()
  const open = (lang: Locale) => (url ? { reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.eveningOpenApp"), url }]] } } : {})
  let sent = 0
  for (const s of (data as { chat_id: number; language: Locale }[] | null) ?? []) {
    // Khmer: the day's reminder (as in the channel); English / Chinese: their short line.
    const text = s.language === "km" ? eveningHtml(day) : tr(s.language, "bot.eveningNudge")
    const r = await sendText(Number(s.chat_id), text, { ...open(s.language), ...(s.language === "km" ? { parse_mode: "HTML" } : {}) }).catch(() => null)
    if (r?.ok) sent += 1
  }
  return sent
}

/** Which post is due at this minute of the Cambodian day (0–1439); each window opens at its hour. */
export function routineDue(minutes: number): "morning" | "evening" | null {
  if (minutes >= MORNING.from && minutes < MORNING.until) return "morning"
  if (minutes >= EVENING.from && minutes < EVENING.until) return "evening"
  return null
}

export const fbLog = (level: "info" | "error", message: string, fold?: boolean) => logEvent(level, "routine", message, { fold })

/** The 07:00 poster on the Facebook Page; every failure is logged, nothing is thrown. */
export const publishMorningToFacebook = (approval: FounderApproval, day: string) =>
  publishLogged("morning post", () => publishPhotoToFacebook(approval, morningPoster(day), facebookMorningCaption(day)), fbLog)

/**
 * Called every minute by the dispatcher. The channel's 20:00 check-in and the Saturday spotlight are
 * preview-first posts now (lib/scheduled-posts.ts plannedPosts — published only with the founder's
 * approval); here only the 20:00 nudge in the private chats of those who asked for it.
 */
export async function communityRoutineTick() {
  const now = phnomPenhToday()
  if (routineDue(now.hour * 60 + now.minute) !== "evening") return
  if (!(await claim(EVENING.job, now.day))) return
  const nudged = await nudgeSubscribers(now.day)
  if (nudged) logEvent("info", "routine", `Evening check-in nudge sent to ${nudged} chat${nudged === 1 ? "" : "s"}`, { fold: true })
}
