// Server only: the community channel's daily routine around the 09:30 market
// bulletin (community-bulletin.ts):
//
//   07:00  ☀️ morning: a short motivation (no tip — tips go out at 12:00, and
//          only after the Super Admin approves them: tip-bot.ts)
//   09:30  📊 market bulletin (community-bulletin.ts)
//   20:00  🌙 evening check-in: "did you record today?" — in the channel, and as
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
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"
import type { Locale } from "@/lib/i18n/dictionaries"

const MORNING = { job: "community-morning", from: 7 * 60, until: 8 * 60 + 30 }
const EVENING = { job: "community-evening", from: 20 * 60, until: 21 * 60 + 30 }

const communityChat = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const QUOTE = "«ស្រឡាញ់លុយ លុយនឹងស្រឡាញ់អ្នកវិញ! ចាប់ផ្តើមថ្ងៃថ្មីដោយភាពឆ្លាតវៃ និងកត់ត្រារាល់ចំណូល-ចំណាយឱ្យបានត្រឹមត្រូវ។»"

/** 07:00 — title and the core quote (Telegram HTML). The tip goes out at 12:00, approved first (tip-bot.ts). */
export function morningText(): string {
  return [
    "☀️ <b>អរុណសួស្តីថ្ងៃថ្មី · ថាមពលហិរញ្ញវត្ថុ</b>",
    "",
    `<i>${esc(QUOTE)}</i>`,
    "",
    "— លុយឆ្លាត · LuyChlat",
  ].join("\n")
}

/** 20:00 — the end-of-day check-in (Telegram HTML). */
export function eveningText(): string {
  return [
    "🌙 <b>រាត្រីសួស្តីពី លុយឆ្លាត · រំលឹកចុងថ្ងៃ</b>",
    "",
    "✨ «តើថ្ងៃនេះ បងបានកត់ត្រាចំណូល និងចំណាយ អស់ហើយឬនៅ?» 📝",
    "",
    "💡 ការកត់ត្រាចំណូល-ចំណាយត្រឹមតែ ១ នាទីមុនចូលគេង ជួយឱ្យបងដឹងច្បាស់ពីប្រាក់ចំណេញ លំហូរសាច់ប្រាក់ គេងលក់ស្រួល និងគ្រប់គ្រងហិរញ្ញវត្ថុបានកាន់តែរឹងមាំ!",
    "",
    "👉 គ្រាន់តែផ្ញើសារសំឡេង ឬវាយប្រាប់ Bot មក (ឧ. «លក់បាន 120$» ឬ «បាយល្ងាច ២៥,០០០៛») នោះលុយឆ្លាតនឹងកត់ត្រាជូនភ្លាម!",
    "",
    "— លុយឆ្លាត · LuyChlat",
  ].join("\n")
}

/** [ 🤖 កត់ត្រាជាមួយ Bot ] [ 📱 បើកកម្មវិធី ] — the channel's standard row. */
const recordButtons = getChannelPostButtons

/** The morning quote on the v3 poster frame (same design as the daily tip, its own tag). */
export function morningPoster(day: string): Buffer {
  const quote = QUOTE.replace(/[«»]/g, "")
  return tipPoster({ title: "អរុណសួស្តីថ្ងៃថ្មី", body: quote }, day, { tag: "ថាមពលហិរញ្ញវត្ថុពេលព្រឹក" })
}

/** Once a day inside the window: claim it, then send. */
async function claim(job: string, day: string) {
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  return data === true
}

/** The bot's own nudge, in each user's language, to those who asked for it and haven't recorded today. */
async function nudgeSubscribers() {
  const { data, error } = await botDb().rpc("bot_evening_checkin_subscribers", { p_key: botKey() })
  if (error) {
    logEvent("error", "routine", `Evening check-in subscribers failed: ${error.message}`, { fold: true })
    return 0
  }
  const url = await appUrl()
  const open = (lang: Locale) => (url ? { reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.eveningOpenApp"), url }]] } } : {})
  let sent = 0
  for (const s of (data as { chat_id: number; language: Locale }[] | null) ?? []) {
    const r = await sendText(Number(s.chat_id), tr(s.language, "bot.eveningNudge"), open(s.language)).catch(() => null)
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

/** Called every minute by the dispatcher. */
export async function communityRoutineTick() {
  const now = phnomPenhToday()
  const due = routineDue(now.hour * 60 + now.minute)
  if (!due) return
  const chat = communityChat()

  if (due === "morning" && chat && (await claim(MORNING.job, now.day))) {
    // The poster with the text as its caption; plain text only if the image can't be sent.
    const buttons = await recordButtons()
    const id = await sendPosterPhoto(chat, morningPoster(now.day), morningText(), { reply_markup: buttons.reply_markup })
    const res = id ? { ok: true as const, description: undefined } : await tg("sendMessage", { chat_id: chat, text: morningText(), parse_mode: "HTML", disable_web_page_preview: true, ...buttons })
    logEvent(res.ok ? "info" : "error", "routine", res.ok ? `Morning post sent to ${chat}${id ? " (poster)" : " (text — poster failed)"}` : `Morning post failed: ${res.description ?? "unknown"}`)
  }

  if (due === "evening" && (await claim(EVENING.job, now.day))) {
    if (chat) {
      const res = await tg("sendMessage", { chat_id: chat, text: eveningText(), parse_mode: "HTML", disable_web_page_preview: true, ...(await recordButtons()) })
      logEvent(res.ok ? "info" : "error", "routine", res.ok ? `Evening check-in sent to ${chat}` : `Evening check-in failed: ${res.description ?? "unknown"}`)
    }
    const nudged = await nudgeSubscribers()
    if (nudged) logEvent("info", "routine", `Evening check-in nudge sent to ${nudged} chat${nudged === 1 ? "" : "s"}`, { fold: true })
  }
}
