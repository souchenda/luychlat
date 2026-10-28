// Server only: sends the official bot's reminders. Started once from instrumentation.ts.
import { pick, type Locale, type MessageKey } from "@/lib/i18n/dictionaries"
import { cambodiaNow, formatMinutes, prayerTimes, PROVINCES } from "@/lib/prayer"
import { duePrayer } from "@/lib/prayer-alerts"
import { groupByMemberProvince, prayerPushPayload, type PrayerPushTarget } from "@/lib/prayer-push"
import { pushToPhones } from "@/lib/server/web-push"
import { sendAdhanAudio } from "@/lib/server/adhan-audio"

import { botDb, botKey, botToken, sendText, SIGNATURE, tr, unescapeHtml } from "./telegram-bot"
import { sendCommunityBulletin, sendIslamicBulletin, syncCommunityPost } from "@/lib/server/community-bulletin"
import { communityRoutineTick } from "@/lib/server/community-routine"
import { scheduledPostsTick } from "@/lib/server/scheduled-posts"
import { dailyTipTick } from "@/lib/server/tip-bot"
import { watchdogTick } from "@/lib/server/health-watchdog"
import { capacityTick } from "@/lib/server/capacity-reminder"
import { marketScheduleTick, syncMarket } from "@/lib/server/market-sync"
import { logEvent } from "@/lib/server/events"
import { weeklyDigestTick } from "@/lib/server/weekly-digest"
import { cfoBriefTick } from "@/lib/server/cfo-brief"
import { readFileSync } from "fs"
import { festivalTick, holyDayTick } from "@/lib/server/holy-days"
import { posterTick } from "@/lib/server/festival-poster"
import { groupSweepTick } from "@/lib/server/group-guard"
import { devEodTick } from "@/lib/server/dev-eod"
import { atmSyncTick } from "@/lib/server/atm-sync"
import { islamicPlacesSyncTick } from "@/lib/server/islamic-places-sync"
import { flushPoolPosts } from "@/lib/server/pool-bot"
import { birthdayTick, dormancyTick, flushSignupAlerts } from "@/lib/server/member-events"
import { flushPlaceSubmissions, flushPlaceThanks } from "@/lib/server/place-alerts"
import { syncEnvApprovers } from "@/lib/server/co-approvers"
import { nightlyReportTick } from "@/lib/server/nightly-report"
import { reactionAuditTick } from "@/lib/server/channel-guard"

type Due = { notification_id: string; user_id: string; chat_id: number; language: Locale; title: string; message: string; bill_id: string | null; due: string | null }
type Subscriber = { user_id: string; chat_id: number; language: Locale; province: string; adhan_audio?: boolean }

/** Debt, installment and card reminders the database created, to each linked member, once. */
async function sendDueNotifications() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_due_notifications", { p_key: botKey(), p_limit: 100 })
  if (error || !data) return
  for (const n of data as Due[]) {
    // Bill reminders get ✅ paid / ⏰ remind tomorrow (handled in bot-commands › billAction).
    const buttons = n.bill_id
      ? {
          reply_markup: {
            inline_keyboard: [
              [
                { text: tr(n.language, "bot.billPaidButton"), callback_data: `bp:${n.bill_id}:${n.due ?? ""}` },
                { text: tr(n.language, "bot.billSnoozeButton"), callback_data: `bs:${n.bill_id}` },
              ],
            ],
          },
        }
      : {}
    const sent = await sendText(n.chat_id, `${unescapeHtml(n.title)}\n${unescapeHtml(n.message)}${SIGNATURE}`, buttons)
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
  // Never a silent failure (CLAUDE.md): a broken query is logged; no subscriber is simply nobody to tell.
  if (error) return logEvent("error", "prayer", `Telegram prayer alerts: subscribers not read — ${error.message}`, { fold: true })
  if (!data?.length) return
  const clock = cambodiaNow()
  const day = `${clock.date.year}-${String(clock.date.month).padStart(2, "0")}-${String(clock.date.day).padStart(2, "0")}`
  let audio = 0
  let text = 0
  let failed = 0
  for (const s of data as Subscriber[]) {
    const place = PROVINCES.find((p) => p.key === s.province) ?? PROVINCES[0]
    const times = prayerTimes(clock.date, place.lat, place.lng)
    const prayer = duePrayer(times, clock.minutes)
    if (!prayer) continue
    const { data: claimed } = await db.rpc("bot_claim_prayer", { p_key: botKey(), p_user_id: s.user_id, p_day: day, p_prayer: prayer })
    if (!claimed) continue
    const name = tr(s.language, `prayer.${prayer}` as MessageKey)
    // The Adhan as audio for members who chose it (founder, 20/10/2026 — /adhan on, or the app switch); the text
    // alert when they didn't, or when the audio could not be sent.
    let sent = false
    if (s.adhan_audio) sent = await sendAdhanAudio(s.chat_id, { prayer, khmer: s.language === "km", prayerName: name, time: formatMinutes(times[prayer]), place: pick(place, s.language) })
    if (sent) audio++
    else if ((await sendText(s.chat_id, `🕌 ${tr(s.language, "prayerAlert.title", { name })}\n${formatMinutes(times[prayer])} · ${pick(place, s.language)}${SIGNATURE}`).catch(() => null))?.ok) text++
    else failed++
  }
  // The real counts (CLAUDE.md: a dispatcher logs how many chats received it — never a bare «sent»).
  if (audio + text + failed) logEvent(failed ? "warn" : "info", "prayer", `Telegram prayer alerts: ${audio} Adhan audio, ${text} text${failed ? `, ${failed} failed` : ""}`, { fold: true })
}

/**
 * The prayer-time Web Push (founder, 20/10/2026): Islamic Mode members' phones ring at each prayer even with the app
 * closed — logged with the real counts. Each phone at its own province's time and with its name (founder, 21/10/2026 —
 * the province picked in the app, saved on the subscription; else the bot's; else Phnom Penh): the phones are grouped by
 * member and province, once per member, day, prayer and province.
 */
async function sendPrayerPush() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_prayer_push_targets", { p_key: botKey() })
  if (error) return logEvent("error", "prayer", `Prayer push: phones not read — ${error.message}`, { fold: true })
  if (!data?.length) return
  const clock = cambodiaNow()
  const day = `${clock.date.year}-${String(clock.date.month).padStart(2, "0")}-${String(clock.date.day).padStart(2, "0")}`
  let members = 0
  let phones = 0
  let failed = 0
  for (const rows of groupByMemberProvince(data as PrayerPushTarget[]).values()) {
    const first = rows[0]
    const userId = first.user_id
    const language = (["km", "en", "zh"].includes(first.language) ? first.language : "km") as Locale
    const place = PROVINCES.find((p) => p.key === first.province) ?? PROVINCES[0]
    const times = prayerTimes(clock.date, place.lat, place.lng)
    const prayer = duePrayer(times, clock.minutes)
    if (!prayer) continue
    const { data: claimed } = await db.rpc("bot_claim_prayer_push", { p_key: botKey(), p_user_id: userId, p_day: day, p_prayer: prayer, p_province: place.key })
    if (!claimed) continue
    const name = tr(language, `prayer.${prayer}` as MessageKey)
    const payload = prayerPushPayload({ prayer, title: tr(language, "prayerAlert.title", { name }), body: tr(language, "prayerAlert.body", { time: formatMinutes(times[prayer]), place: pick(place, language) }) })
    // Kept 10 minutes for a phone that is briefly offline — an Adhan alert later than that is noise.
    const r = await pushToPhones(rows, payload, 10 * 60)
    if (!r) return // push not configured on this server
    members++
    phones += r.ok
    failed += r.failed
  }
  if (members) logEvent(failed ? "warn" : "info", "prayer", `Prayer push: ${phones} phone(s) of ${members} member(s)${failed ? `, ${failed} failed` : ""}`, { fold: true })
}

let running = false

/** One pass; overlapping passes are skipped. */
export async function dispatchOnce() {
  if (running || !botToken()) return
  running = true
  try {
    await sendDueNotifications()
    await sendPrayerTimes()
    await sendPrayerPush()
    await marketScheduleTick()
    await sendCommunityBulletin()
    await sendIslamicBulletin()
    await syncCommunityPost()
    await communityRoutineTick()
    await scheduledPostsTick()
    await dailyTipTick()
    await weeklyDigestTick()
    await cfoBriefTick()
    await holyDayTick()
    await festivalTick()
    await posterTick()
    await flushPoolPosts()
    await flushSignupAlerts()
    // A member's place suggestion → the approval room within a minute (founder, 19/10/2026).
    await flushPlaceSubmissions()
    // An approved suggestion thanks its member once, however it was approved (founder, 19/10/2026).
    await flushPlaceThanks()
    await birthdayTick()
    await dormancyTick()
    await groupSweepTick()
    await devEodTick()
    // 23:30: the server's health and today's members and approvals, to «LCA Approval» (founder, 19/10/2026).
    await nightlyReportTick()
    await atmSyncTick()
    await islamicPlacesSyncTick()
    await watchdogTick()
    // Capacity and spending: the founder told once when an item is full enough to act on (founder, 28/10/2026).
    await capacityTick()
    await reactionAuditTick()
  } catch (error) {
    console.error("[bot] dispatch failed:", (error as Error).message)
    logEvent("error", "dispatcher", `Scheduler pass failed: ${(error as Error).message}`, { fold: true })
  } finally {
    running = false
  }
}

/** Every minute while the server runs (one app instance on the Droplet). */
/**
 * Zero-downtime deploys run two containers for a moment (blue / green). Only
 * the one Nginx points at — named in deploy/run/active-slot, mounted at
 * /run/luysmart — sends reminders and posts, so nothing goes out twice. No
 * file (a single container, local runs) means active.
 */
function isActiveSlot() {
  try {
    const active = readFileSync("/run/luysmart/active-slot", "utf8").trim()
    return !active || active === (process.env.APP_SLOT || "blue")
  } catch {
    return true
  }
}

export function startBotDispatcher() {
  if (!botToken()) return
  const ifActive = (job: () => Promise<unknown>) => () => void (isActiveSlot() ? job() : undefined)
  setInterval(ifActive(() => dispatchOnce()), 60_000)
  setTimeout(ifActive(() => dispatchOnce()), 15_000)
  // The co-approvers in TELEGRAM_APPROVER_IDS (founder, 19/10/2026), once at start.
  setTimeout(ifActive(() => syncEnvApprovers()), 10_000)
  // Live market rates (NBC + gold spot) for every user: at start, then every 30 minutes.
  setTimeout(ifActive(() => syncMarket(true)), 20_000)
  setInterval(ifActive(() => syncMarket(true)), 30 * 60_000)
  console.log("[bot] reminder dispatcher and market sync started")
}
