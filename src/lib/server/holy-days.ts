// Server only: the 07:00 holy-day reminders — the eve (with festivals and Khmer-Chinese offering
// days) and the day itself — for chats that switched them on and the channel, and one festival
// wish to every linked chat.
import { culturalDayOn, NO_EVE_REMINDER, type CulturalKey } from "@/lib/cultural-calendar"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { formatLunar, khmerLunarDate } from "@/lib/khmer-lunar"
import { HOLY_DAY_MINUTE, holyDayStages, silDayText, silEveText } from "@/lib/holy-day-alerts"
import { getChannelPostButtons } from "./channel-buttons"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, SIGNATURE, tg, tr } from "./telegram-bot"

const JOB = "holy-day-eve"

const EMOJI: Record<CulturalKey, string> = {
  new_year: "🎉",
  little_new_year: "🧧",
  cny_eve: "🧧",
  chinese_new_year: "🧧",
  khmer_new_year: "🌼",
  hungry_ghost: "🏮",
  mid_autumn: "🥮",
  pchum_ben: "🙏",
  water_festival: "🚣",
  dongzhi: "🥣",
}

/**
 * Called every minute by the dispatcher, 07:00–11:59 Cambodia time (founder, 10/10), in two stages:
 *   eve — tomorrow is a holy day (ថ្ងៃសីល) and/or the first day of a festival or offering day:
 *         buy lotus, fruit and offerings ahead of time (festivals: budget for the celebration);
 *   day — today is a holy day: the morning blessing.
 * Each goes once a day (claimed) to the chats that switched the reminder on, and to the
 * community channel (holy days only, with the standard buttons).
 */
export async function holyDayTick() {
  const now = phnomPenhToday()
  if (now.hour * 60 + now.minute < HOLY_DAY_MINUTE || now.hour >= 12) return
  const tomorrow = new Date(Date.parse(`${now.day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const lunar = khmerLunarDate(tomorrow)
  const stages = holyDayStages(now.day)
  const starting = culturalDayOn(tomorrow)
  const culture = starting && starting.start === tomorrow && !NO_EVE_REMINDER.has(starting.key) ? starting : null

  if (stages.eve || culture)
    await sendStage(JOB, now.day, (lang) => {
      const lines: string[] = []
      if (culture) {
        const name = tr(lang, `cultural.${culture.key}.name` as MessageKey)
        lines.push(tr(lang, culture.kind === "offering" ? "bot.offeringTomorrow" : "bot.festivalTomorrow", { emoji: EMOJI[culture.key], name }))
      }
      if (stages.eve) lines.push(lang === "km" ? silEveText(stages.eve) : tr(lang, "bot.silTomorrow", { lunar: formatLunar(lunar, lang) }))
      return lines.join("\n\n")
    }, stages.eve ? silEveText(stages.eve) : null, [culture?.key, stages.eve && "holy day eve"].filter(Boolean).join(" + "))

  if (stages.today)
    await sendStage("holy-day-today", now.day, (lang) => (lang === "km" ? silDayText(stages.today!) : tr(lang, "bot.silToday", { lunar: formatLunar(khmerLunarDate(now.day), lang) })), silDayText(stages.today), "holy day")
}

/** One stage: the subscribed chats (in their language) and the channel, each once a day. */
async function sendStage(job: string, day: string, text: (lang: Locale) => string, channelText: string | null, what: string) {
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_holy_day_subscribers", { p_key: botKey() })
  if (error) {
    logEvent("error", "holy-days", `Subscriber query failed: ${error.message}`, { fold: true })
    return
  }
  let sent = 0
  for (const s of (data as { chat_id: number; language: Locale }[] | null) ?? []) {
    try {
      const r = await sendText(s.chat_id, text(s.language) + SIGNATURE)
      if (r.ok) sent += 1
    } catch (e) {
      logEvent("error", "holy-days", `Reminder for one chat failed: ${(e as Error).message}`, { fold: true })
    }
  }
  if (sent) logEvent("info", "holy-days", `${what} sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
  const channel = (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim()
  if (channelText && channel) {
    const r = await tg("sendMessage", { chat_id: channel, text: channelText, ...(await getChannelPostButtons()) }).catch(() => null)
    logEvent(r?.ok ? "info" : "error", "holy-days", r?.ok ? `${what} posted to ${channel}` : `${what} channel post failed`, { fold: true })
  }
}

/**
 * From 08:00 Cambodia time on the first day of a festival (New Year, Chinese
 * New Year, Khmer New Year, Pchum Ben, Water Festival), every active linked
 * chat gets one wish (claimed per festival, so restarts don't repeat it).
 * Pchum Ben skips people who use Islamic Mode.
 */
export async function festivalTick() {
  const now = phnomPenhToday()
  if (now.hour < 8) return
  const festival = culturalDayOn(now.day)
  if (!festival || festival.kind !== "festival" || festival.start !== now.day) return

  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: `festival-${festival.key}`, p_day: now.day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_festival_people", { p_key: botKey(), p_buddhist: festival.key === "pchum_ben" })
  if (error) {
    logEvent("error", "festivals", `Recipient query failed: ${error.message}`, { fold: true })
    return
  }
  const year = festival.start.slice(0, 4)
  let sent = 0
  for (const p of (data as { chat_id: number; language: Locale }[] | null) ?? []) {
    const title = tr(p.language, `festival.${festival.key}.title` as MessageKey, { year })
    const body = tr(p.language, `festival.${festival.key}.body` as MessageKey)
    const r = await sendText(p.chat_id, `${EMOJI[festival.key]} ${title}\n\n${body}` + SIGNATURE).catch(() => null)
    if (r?.ok) sent += 1
  }
  if (sent) logEvent("info", "festivals", `Festival wish (${festival.key}) sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}
