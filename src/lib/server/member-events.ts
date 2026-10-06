// Server only: member events from the bot dispatcher — a note to the super
// admins for each new sign-up, and birthday wishes at 08:00 Cambodia time.
import type { Locale } from "@/lib/i18n/dictionaries"
import { loginLabel } from "@/lib/auth-identifier"

import { appUrl } from "./community-bulletin"
import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, SIGNATURE, tg, tr } from "./telegram-bot"

type Pending = { user_id: string; email: string | null; provider: string; created_at: string; total_members: number; display_name?: string | null }
type AdminChat = { chat_id: number; language: Locale }

const METHOD: Record<string, string> = { phone: "Phone", email: "Email", google: "Google", apple: "Apple" }

/** "06/10/2026 08:15 AM" in Cambodia time. */
function cambodiaTime(iso: string) {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, "0")
  const h = t.getUTCHours()
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${pad(h % 12 || 12)}:${pad(t.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`
}

/**
 * New accounts → one note per account to every super admin's linked Telegram
 * chat (sign-up itself never waits on this: a trigger queues, this sends).
 */
export async function flushSignupAlerts() {
  const db = botDb()
  const { data, error } = await db.rpc("bot_signup_alerts_pending", { p_key: botKey() })
  if (error || !Array.isArray(data) || data.length === 0) return
  const { data: chats } = await db.rpc("bot_admin_chats", { p_key: botKey() })
  const admins = (chats as AdminChat[] | null) ?? []
  if (admins.length === 0) return // kept for 2 days, in case an admin links Telegram
  for (const p of data as Pending[]) {
    let delivered = false
    for (const a of admins) {
      const text = tr(a.language, "bot.signupAlert", {
        // The name typed at sign-up; a masked default ("•••222") is no name.
        name: p.display_name && !p.display_name.startsWith("•") ? p.display_name : "—",
        account: loginLabel(p.email) || "—",
        date: cambodiaTime(p.created_at),
        method: METHOD[p.provider] ?? p.provider,
        total: Number(p.total_members).toLocaleString("en-US"),
      })
      // Straight to Telegram, plain text: the admin asked to see the new member's number (sendText would mask it).
      const sent = (await tg("sendMessage", { chat_id: a.chat_id, text, disable_web_page_preview: true })) as { ok?: boolean }
      delivered ||= Boolean(sent.ok)
    }
    if (delivered) await db.rpc("bot_signup_alert_sent", { p_key: botKey(), p_user_id: p.user_id })
  }
}

const BIRTHDAY_JOB = "birthday-wishes"

/** From 08:00 Cambodia time, once a day: a birthday wish to everyone born today who linked Telegram. */
export async function birthdayTick() {
  const now = phnomPenhToday()
  if (now.hour < 8) return
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
