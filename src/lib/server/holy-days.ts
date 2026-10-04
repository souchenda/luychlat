// Server only: Buddhist holy-day (ថ្ងៃសីល) reminders for chats that switched them on.
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatLunar, isSilDay, khmerLunarDate } from "@/lib/khmer-lunar"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, SIGNATURE, tr } from "./telegram-bot"

const JOB = "holy-day-eve"

/**
 * Called every minute by the dispatcher. From 18:00 Cambodia time, when
 * tomorrow is a holy day, each subscribed chat gets one reminder (claimed once
 * per day, so restarts don't repeat it).
 */
export async function holyDayTick() {
  const now = phnomPenhToday()
  if (now.hour < 18) return
  const tomorrow = new Date(Date.parse(`${now.day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const lunar = khmerLunarDate(tomorrow)
  if (!isSilDay(lunar)) return

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
    try {
      const r = await sendText(s.chat_id, tr(s.language, "bot.silTomorrow", { lunar: formatLunar(lunar, s.language) }) + SIGNATURE)
      if (r.ok) sent += 1
    } catch (e) {
      logEvent("error", "holy-days", `Reminder for one chat failed: ${(e as Error).message}`, { fold: true })
    }
  }
  if (sent) logEvent("info", "holy-days", `Holy-day reminder sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}
