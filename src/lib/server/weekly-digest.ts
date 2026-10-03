// Server only: the opt-in Sunday digest (see src/lib/bot/digest.ts and the weekly_digest migration).
import { DEFAULT_ABOUT } from "@/lib/app-info"
import { buildDigest, type DigestRow } from "@/lib/bot/digest"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, tr } from "./telegram-bot"

/** Sunday from 19:30 until 23:59, Cambodia time. */
const SEND_FROM = { hour: 19, minute: 30 }

/** Monday of the week that ends on this Sunday (YYYY-MM-DD). */
const weekStartOf = (sunday: string) => new Date(Date.parse(`${sunday}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10)

/**
 * Called every minute by the dispatcher. On Sunday evening it sends the
 * digest to every opted-in chat with spending this week, a batch per minute;
 * each chat is marked as sent so restarts and later passes skip it.
 */
export async function weeklyDigestTick() {
  const now = phnomPenhToday()
  const sunday = new Date(`${now.day}T12:00:00Z`).getUTCDay() === 0
  const inWindow = now.hour > SEND_FROM.hour || (now.hour === SEND_FROM.hour && now.minute >= SEND_FROM.minute)
  if (!sunday || !inWindow) return
  const weekStart = weekStartOf(now.day)

  const db = botDb()
  const { data, error } = await db.rpc("bot_weekly_digest", { p_key: botKey(), p_week_start: weekStart, p_limit: 30 })
  if (error) {
    logEvent("error", "weekly-digest", `Digest query failed: ${error.message}`, { fold: true })
    return
  }
  const rows = (data as DigestRow[] | null) ?? []
  let sent = 0
  for (const row of rows) {
    const { text, button } = buildDigest(row, weekStart, (key, params) => tr(row.language, key, params), new Date(`${weekStart}T12:00:00Z`))
    const result = await sendText(row.chat_id, text, { reply_markup: { inline_keyboard: [[{ text: button, url: `${DEFAULT_ABOUT.website}/reports` }]] } })
    // Blocked or deleted chats are marked too, so they aren't retried every minute.
    if (result.ok || /blocked|chat not found|deactivated/i.test(result.description ?? "")) {
      await db.rpc("bot_mark_digest_sent", { p_key: botKey(), p_user_id: row.user_id, p_week_start: weekStart })
      if (result.ok) sent += 1
    }
  }
  if (sent) logEvent("info", "weekly-digest", `Weekly digest sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}
