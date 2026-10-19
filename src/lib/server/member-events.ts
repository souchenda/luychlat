// Server only: member events from the bot dispatcher — a note to the super
// admins for each new sign-up, and birthday wishes from 07:00 Cambodia time (with the morning round).
import type { Locale } from "@/lib/i18n/dictionaries"
import { loginLabel } from "@/lib/auth-identifier"

import { appUrl } from "./community-bulletin"
import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, SIGNATURE, tg, tr } from "./telegram-bot"
import { sourceForAlert } from "@/lib/acquisition"
import { signupAlertText } from "@/lib/activity-alerts"
import { founderChats } from "./admin-routes"

type Pending = { user_id: string; email: string | null; provider: string; created_at: string; total_members: number; display_name?: string | null; acquisition_source?: string | null; islamic?: boolean }

const METHOD: Record<string, string> = { phone: "Phone", email: "Email", google: "Google", apple: "Apple" }

/** "06/10/2026 08:15 AM" in Cambodia time. */
function cambodiaTime(iso: string) {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, "0")
  const h = t.getUTCHours()
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${pad(h % 12 || 12)}:${pad(t.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`
}

/**
 * New accounts → the approval room «LCA Approval», the founder's live activity stream (founder, 19/10/2026; else the
 * marketing chat, else the super admins' chats — lib/server/admin-routes), at once, one card per account with the
 * member's community badge. Sign-up itself never waits on this: a trigger queues, this sends.
 */
export async function flushSignupAlerts() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_signup_alerts_pending", { p_key: botKey() })
  if (error || !Array.isArray(data) || data.length === 0) return
  // The founder's private chat — informational, never «LCA Approval» (an approval queue, founder 20/10/2026).
  const chats = await founderChats()
  if (chats.length === 0) return // kept for 2 days, in case the room is set later
  for (const p of data as Pending[]) {
    // The name typed at sign-up (a masked default "•••222" is no name), else the phone / email.
    const name = p.display_name && !p.display_name.startsWith("•") ? p.display_name : null
    const src = sourceForAlert(p.acquisition_source)
    const text = signupAlertText({
      name,
      account: loginLabel(p.email) || "—",
      at: cambodiaTime(p.created_at),
      islamic: Boolean(p.islamic),
      method: METHOD[p.provider] ?? p.provider,
      source: !src ? null : typeof src === "string" ? tr("km", `source.${src}`) : `${tr("km", "source.other")}: ${src.other}`,
      total: Number(p.total_members),
    })
    let delivered = false
    for (const chat of chats) {
      // Straight to Telegram, quietly (no sound): the founder asked to see the new member's number (sendText would mask it).
      const sent = (await tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_notification: true, disable_web_page_preview: true })) as { ok?: boolean }
      delivered ||= Boolean(sent.ok)
    }
    if (delivered) await db.rpc("bot_signup_alert_sent", { p_key: botKey(), p_user_id: p.user_id })
  }
}

const BIRTHDAY_JOB = "birthday-wishes"

/** From 07:00 Cambodia time, once a day: a birthday wish to everyone born today who linked Telegram. */
export async function birthdayTick() {
  const now = phnomPenhToday()
  if (now.hour < 7) return
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: BIRTHDAY_JOB, p_day: now.day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_birthday_people", { p_key: botKey(), p_day: now.day })
  if (error) {
    logEvent("error", "birthdays", `Birthday query failed: ${error.message}`, { fold: true })
    return
  }
  let sent = 0
  for (const p of (data as { chat_id: number; language: Locale; display_name: string | null }[] | null) ?? []) {
    // A masked default name ("•••678") or none: a warm "you" instead.
    const name = p.display_name && !p.display_name.startsWith("•") ? p.display_name : tr(p.language, "bot.birthdayYou")
    try {
      const r = await sendText(p.chat_id, tr(p.language, "bot.birthdayWish", { name }) + SIGNATURE)
      if (r.ok) sent += 1
    } catch (e) {
      logEvent("error", "birthdays", `Wish for one chat failed: ${(e as Error).message}`, { fold: true })
    }
  }
  if (sent) logEvent("info", "birthdays", `Birthday wishes sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}

const DORMANCY_JOB = "dormancy"

/**
 * From 10:00 Cambodia time, once a day: accounts quiet for 180 days are put to
 * sleep (sessions end, data closed until they reactivate), and those quiet for
 * 150 days get one friendly Telegram nudge.
 */
export async function dormancyTick() {
  const now = phnomPenhToday()
  if (now.hour < 10) return
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: DORMANCY_JOB, p_day: now.day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_dormancy_run", { p_key: botKey() })
  if (error) {
    logEvent("error", "dormancy", `Dormancy run failed: ${error.message}`, { fold: true })
    return
  }
  const url = (await appUrl()) ?? ""
  let sent = 0
  for (const p of (data as { chat_id: number; language: Locale; display_name: string | null }[] | null) ?? []) {
    const name = p.display_name && !p.display_name.startsWith("•") ? p.display_name : tr(p.language, "bot.birthdayYou")
    const r = await sendText(p.chat_id, tr(p.language, "bot.dormancyNudge", { name, url }) + SIGNATURE).catch(() => null)
    if (r?.ok) sent += 1
  }
  if (sent) logEvent("info", "dormancy", `Inactivity nudge sent to ${sent} chat${sent === 1 ? "" : "s"}`, { fold: true })
}
