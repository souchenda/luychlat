// Server only: the opt-in weekly digest — Sunday evening for every opted-in
// chat, and on demand with /digest (see src/lib/bot/digest.ts).
import { DEFAULT_ABOUT } from "@/lib/app-site"
import { buildDigest, weekStartOf, type DigestRow } from "@/lib/bot/digest"
import type { Locale } from "@/lib/i18n/dictionaries"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, tr } from "./telegram-bot"

/** Sunday from 19:00 (12:00 UTC) until 23:59, Cambodia time. */
const SEND_FROM = { hour: 19, minute: 0 }

const dashboardButton = (text: string) => ({ reply_markup: { inline_keyboard: [[{ text, url: `${DEFAULT_ABOUT.website}/reports` }]] } })

/**
 * Called every minute by the dispatcher. On Sunday evening it sends the
 * digest to every opted-in chat with entries this week, a batch per minute;
 * each chat is marked as sent so restarts and later passes skip it. A failure
 * for one chat is logged and the others still go out.
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
  let sent = 0
  for (const row of (data as DigestRow[] | null) ?? []) {
    try {
      const { text, button } = buildDigest(row, weekStart, (key, params) => tr(row.language, key, params))
      const result = await sendText(row.chat_id, text, dashboardButton(button))
      // Blocked or deleted chats are marked too, so they aren't retried every minute.
      if (result.ok || /blocked|chat not found|deactivated/i.test(result.description ?? "")) {
        await db.rpc("bot_mark_digest_sent", { p_key: botKey(), p_user_id: row.user_id, p_week_start: weekStart })
        if (result.ok) sent += 1
      }
    } catch (e) {
      logEvent("error", "weekly-digest", `Digest for one chat failed: ${(e as Error).message}`, { fold: true })
    }
  }
  if (sent) logEvent("info", "weekly-digest", `Weekly digest sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}

/**
 * /digest: this week's digest now (Monday to today). Only for chats that
 * switched the digest on in Settings › Telegram — it puts money totals in the
 * chat, which the bot otherwise never does.
 */
export async function sendDigestNow(chatId: number, fallbackLang: Locale) {
  const weekStart = weekStartOf(phnomPenhToday().day)
  const { data, error } = await botDb().rpc("bot_digest_for_chat", { p_key: botKey(), p_chat_id: chatId, p_week_start: weekStart })
  const r = data as { status: "ok" | "off" | "not_linked" | "suspended"; language?: Locale; digest?: DigestRow } | null
  const lang = r?.digest?.language ?? r?.language ?? fallbackLang
  if (error || !r || r.status === "not_linked" || r.status === "suspended") return sendText(chatId, tr(lang, "bot.help"))
  if (r.status === "off") return sendText(chatId, tr(lang, "bot.digestOff"), dashboardButton(tr(lang, "bot.openApp")))
  const row = r.digest!
  if (row.entries === 0) return sendText(chatId, tr(lang, "bot.digestEmpty"))
  const { text, button } = buildDigest(row, weekStart, (key, params) => tr(lang, key, params))
  return sendText(chatId, text, dashboardButton(button))
}
