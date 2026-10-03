// Server only: sends the official bot's reminders. Started once from instrumentation.ts.
import { pick, type Locale, type MessageKey } from "@/lib/i18n/dictionaries"
import { cambodiaNow, formatMinutes, prayerTimes, PROVINCES } from "@/lib/prayer"
import { duePrayer } from "@/lib/prayer-alerts"

import { botDb, botKey, botToken, sendText, SIGNATURE, tr, unescapeHtml } from "./telegram-bot"
import { sendCommunityBulletin } from "@/lib/server/community-bulletin"
import { watchdogTick } from "@/lib/server/health-watchdog"
import { maybeRefreshLocalGold, syncMarket } from "@/lib/server/market-sync"
import { logEvent } from "@/lib/server/events"
import { weeklyDigestTick } from "@/lib/server/weekly-digest"

type Due = { notification_id: string; user_id: string; chat_id: number; language: Locale; title: string; message: string }
type Subscriber = { user_id: string; chat_id: number; language: Locale; province: string }

/** Debt, installment and card reminders the database created, to each linked member, once. */
async function sendDueNotifications() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_due_notifications", { p_key: botKey(), p_limit: 100 })
  if (error || !data) return
  for (const n of data as Due[]) {
    const sent = await sendText(n.chat_id, `${unescapeHtml(n.title)}\n${unescapeHtml(n.message)}${SIGNATURE}`)
    // Blocked or deleted chats are marked too, so they aren't retried forever.
    if (sent.ok || /blocked|chat not found|deactivated/i.test(sent.description ?? "")) {
      await db.rpc("bot_mark_delivered", { p_key: botKey(), p_notification_id: n.notification_id, p_user_id: n.user_id })
    }
  }
}

/** Prayer-time messages for the chosen province, once per prayer and day. */
async function sendPrayerTimes() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_prayer_subscribers", { p_key: botKey() })
  if (error || !data?.length) return
  const clock = cambodiaNow()
  const day = `${clock.date.year}-${String(clock.date.month).padStart(2, "0")}-${String(clock.date.day).padStart(2, "0")}`
  for (const s of data as Subscriber[]) {
    const place = PROVINCES.find((p) => p.key === s.province) ?? PROVINCES[0]
    const times = prayerTimes(clock.date, place.lat, place.lng)
    const prayer = duePrayer(times, clock.minutes)
    if (!prayer) continue
    const { data: claimed } = await db.rpc("bot_claim_prayer", { p_key: botKey(), p_user_id: s.user_id, p_day: day, p_prayer: prayer })
    if (!claimed) continue
    const name = tr(s.language, `prayer.${prayer}` as MessageKey)
    await sendText(s.chat_id, `🕌 ${tr(s.language, "prayerAlert.title", { name })}\n${formatMinutes(times[prayer])} · ${pick(place, s.language)}${SIGNATURE}`)
  }
}

let running = false

/** One pass; overlapping passes are skipped. */
export async function dispatchOnce() {
  if (running || !botToken()) return
  running = true
  try {
    await sendDueNotifications()
    await sendPrayerTimes()
    await maybeRefreshLocalGold()
    await sendCommunityBulletin()
    await weeklyDigestTick()
    await watchdogTick()
  } catch (error) {
    console.error("[bot] dispatch failed:", (error as Error).message)
    logEvent("error", "dispatcher", `Scheduler pass failed: ${(error as Error).message}`, { fold: true })
  } finally {
    running = false
  }
}

/** Every minute while the server runs (one app instance on the Droplet). */
export function startBotDispatcher() {
  if (!botToken()) return
  setInterval(() => void dispatchOnce(), 60_000)
  setTimeout(() => void dispatchOnce(), 15_000)
  // Live market rates (NBC + gold spot) for every user: at start, then every 30 minutes.
  setTimeout(() => void syncMarket(true), 20_000)
  setInterval(() => void syncMarket(true), 30 * 60_000)
  console.log("[bot] reminder dispatcher and market sync started")
}
