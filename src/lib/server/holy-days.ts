// Server only: the eve reminder (holy days, festivals, Khmer-Chinese offering
// days) for chats that switched it on, and one festival wish to every linked chat.
import { culturalDayOn, NO_EVE_REMINDER, type CulturalKey } from "@/lib/cultural-calendar"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { formatLunar, isSilDay, khmerLunarDate } from "@/lib/khmer-lunar"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, SIGNATURE, tr } from "./telegram-bot"

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
 * Called every minute by the dispatcher. From 18:00 Cambodia time, when
 * tomorrow is a holy day (ថ្ងៃសីល) and/or the first day of a festival or
 * offering day, each subscribed chat gets one message covering both (claimed
 * once per day, so restarts don't repeat it). Offering days ask families to buy
 * offerings and set a budget; festivals to budget for the celebration.
 */
export async function holyDayTick() {
  const now = phnomPenhToday()
  if (now.hour < 18) return
  const tomorrow = new Date(Date.parse(`${now.day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const lunar = khmerLunarDate(tomorrow)
  const sil = isSilDay(lunar)
  const starting = culturalDayOn(tomorrow)
  const culture = starting && starting.start === tomorrow && !NO_EVE_REMINDER.has(starting.key) ? starting : null
  if (!sil && !culture) return

  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: JOB, p_day: now.day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_holy_day_subscribers", { p_key: botKey() })
  if (error) {
    logEvent("error", "holy-days", `Subscriber query failed: ${error.message}`, { fold: true })
    return
  }
  let sent = 0
  for (const s of (data as { chat_id: number; language: Locale }[] | null) ?? []) {
    const lines: string[] = []
    if (culture) {
      const name = tr(s.language, `cultural.${culture.key}.name` as MessageKey)
      lines.push(tr(s.language, culture.kind === "offering" ? "bot.offeringTomorrow" : "bot.festivalTomorrow", { emoji: EMOJI[culture.key], name }))
    }
    if (sil) lines.push(tr(s.language, "bot.silTomorrow", { lunar: formatLunar(lunar, s.language) }))
    try {
      const r = await sendText(s.chat_id, lines.join("\n\n") + SIGNATURE)
      if (r.ok) sent += 1
    } catch (e) {
      logEvent("error", "holy-days", `Reminder for one chat failed: ${(e as Error).message}`, { fold: true })
    }
  }
  const what = [culture?.key, sil && "holy day"].filter(Boolean).join(" + ")
  if (sent) logEvent("info", "holy-days", `Eve reminder (${what}) sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
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
