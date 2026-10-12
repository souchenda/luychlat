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
import { getChannelPostButtons } from "@/lib/server/channel-buttons"
import { sendPosterPhoto } from "@/lib/server/tip-bot"
import { tipPoster } from "@/lib/server/tip-poster"
import { logEvent } from "@/lib/server/events"
import { eveningHtml } from "@/lib/evening-reminder"
import { morningQuote } from "@/lib/morning"
import { holidayDue, holidayMessage, holidayMoment, holidayPostHtml } from "@/lib/holiday-lifecycle"
import { sendMorningPush } from "@/lib/server/web-push"
import {
  facebookConfig,
  facebookHolidayMessage,
  facebookMorningCaption,
  publishLogged,
  publishPhotoToFacebook,
  publishTextToFacebook,
  shouldPublishToFacebook,
} from "@/lib/server/facebook-publisher"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"
import type { Locale } from "@/lib/i18n/dictionaries"

const MORNING = { job: "community-morning", from: 7 * 60, until: 8 * 60 + 30 }
const EVENING = { job: "community-evening", from: 20 * 60, until: 21 * 60 + 30 }

const communityChat = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")


/** 07:00 — title and the core quote (Telegram HTML). The tip goes out at 12:00, approved first (tip-bot.ts). */
export function morningText(day: string): string {
  return [
    "☀️ <b>អរុណសួស្តីថ្ងៃថ្មី · ថាមពលហិរញ្ញវត្ថុ</b>",
    "",
    `<i>${esc(`«${morningQuote(day)}»`)}</i>`,
    "",
    "— អេប លុយឆ្លាត",
  ].join("\n")
}

/** 20:00 — the end-of-day check-in (Telegram HTML): three short lines, a different one each weekday. */
export const eveningText = (day: string) => eveningHtml(day)

/** [ 🤖 កត់ត្រាតាម Telegram ↗ ] [ 📱 បើកក្នុងអេប លុយឆ្លាត ↗ ] — the channel's standard row. */
const recordButtons = getChannelPostButtons

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

async function holidayTick(day: string, minutes: number) {
  const job = holidayDue(day, minutes)
  const chat = communityChat()
  if (!job || !chat || !(await claim(job, day))) return
  const res = await tg("sendMessage", { chat_id: chat, text: holidayPostHtml(holidayMoment(day)!), parse_mode: "HTML", disable_web_page_preview: true, ...(await recordButtons()) })
  logEvent(res.ok ? "info" : "error", "routine", res.ok ? `Holiday note (${job}) sent to ${chat}` : `Holiday note (${job}) failed: ${res.description ?? "unknown"}`)
  // The Page too — a holiday note is worth the public feed; its own claim, after Telegram.
  if (shouldPublishToFacebook({ kind: "holiday" }) && facebookConfig() && (await claim(`facebook-${job}`, day))) {
    const { title, body } = holidayMessage(holidayMoment(day)!)
    await publishLogged(`holiday note (${job})`, () => publishTextToFacebook(facebookHolidayMessage(title, body)), fbLog)
  }
}

const fbLog = (level: "info" | "error", message: string, fold?: boolean) => logEvent(level, "routine", message, { fold })

/** The 07:00 poster on the Facebook Page; every failure is logged, nothing is thrown. */
export const publishMorningToFacebook = (day: string) =>
  publishLogged("morning post", () => publishPhotoToFacebook(morningPoster(day), facebookMorningCaption(day)), fbLog)

/** Called every minute by the dispatcher. */
export async function communityRoutineTick() {
  const now = phnomPenhToday()
  await holidayTick(now.day, now.hour * 60 + now.minute)
  const due = routineDue(now.hour * 60 + now.minute)
  if (!due) return
  const chat = communityChat()

  if (due === "morning" && chat && (await claim(MORNING.job, now.day))) {
    // The poster with the text as its caption; plain text only if the image can't be sent.
    const buttons = await recordButtons()
    const id = await sendPosterPhoto(chat, morningPoster(now.day), morningText(now.day), { reply_markup: buttons.reply_markup })
    const res = id ? { ok: true as const, description: undefined } : await tg("sendMessage", { chat_id: chat, text: morningText(now.day), parse_mode: "HTML", disable_web_page_preview: true, ...buttons })
    logEvent(res.ok ? "info" : "error", "routine", res.ok ? `Morning post sent to ${chat}${id ? " (poster)" : " (text — poster failed)"}` : `Morning post failed: ${res.description ?? "unknown"}`)
  }
  // The Facebook Page: the same poster, once a day — only when its credentials are set, never blocking Telegram.
  if (due === "morning" && shouldPublishToFacebook({ kind: "morning" }) && facebookConfig() && (await claim("facebook-morning", now.day))) await publishMorningToFacebook(now.day)
  // Phones that turned on notifications: the same quote, once a day (its own claim, so a channel problem never blocks it).
  if (due === "morning" && (await claim("push-morning", now.day))) await sendMorningPush()

  // 20:00 is Telegram only — never the Facebook Page (shouldPublishToFacebook({ kind: "evening" }) is false).
  if (due === "evening" && (await claim(EVENING.job, now.day))) {
    if (chat) {
      const res = await tg("sendMessage", { chat_id: chat, text: eveningText(now.day), parse_mode: "HTML", disable_web_page_preview: true, ...(await recordButtons()) })
      logEvent(res.ok ? "info" : "error", "routine", res.ok ? `Evening check-in sent to ${chat}` : `Evening check-in failed: ${res.description ?? "unknown"}`)
    }
    const nudged = await nudgeSubscribers(now.day)
    if (nudged) logEvent("info", "routine", `Evening check-in nudge sent to ${nudged} chat${nudged === 1 ? "" : "s"}`, { fold: true })
  }
}
