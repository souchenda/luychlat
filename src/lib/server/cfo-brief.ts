// Server only: the Weekly Financial Health Doctor — every Sunday from 18:00 Cambodia time, the
// business owner's brief in Telegram (lib/bot/cfo-brief.ts), and on demand with /cfo or /healthcheck.
// Only the workspace OWNER's private chat, only with «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» on (bot_cfo_recipients /
// bot_cfo_for_chat check it); once a week per business (cfo_brief_sent).
import { DEFAULT_ABOUT } from "@/lib/app-site"
import { buildCfoBrief, cfoBriefDue, cfoWeekIdle, type CfoData } from "@/lib/bot/cfo-brief"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText } from "./telegram-bot"

const reportsButton = { reply_markup: { inline_keyboard: [[{ text: "📊 មើលរបាយការណ៍ និងពន្ធ", url: `${DEFAULT_ABOUT.website}/reports` }]] } }

export async function cfoBriefTick() {
  const now = phnomPenhToday()
  if (!cfoBriefDue(now.day, now.hour)) return
  const db = botDb()
  const { data, error } = await db.rpc("bot_cfo_recipients", { p_key: botKey(), p_today: now.day, p_limit: 30 })
  if (error) return logEvent("error", "cfo-brief", `Recipients failed: ${error.message}`, { fold: true })
  let sent = 0
  let idle = 0
  for (const r of (data as { workspace_id: string; chat_id: number; data: CfoData | null }[] | null) ?? []) {
    try {
      // Nothing recorded this week (Task #504): no $0.00 brief — marked below like a sent one, never retried.
      if (r.data && cfoWeekIdle(r.data)) idle += 1
      else if (r.data) {
        const res = await sendText(Number(r.chat_id), buildCfoBrief(r.data), { parse_mode: "HTML", ...reportsButton })
        if (res.ok) sent += 1
      }
    } catch (e) {
      logEvent("warn", "cfo-brief", `Send failed: ${(e as Error).message?.slice(0, 80)}`, { fold: true })
    }
    // Marked either way: a blocked chat is not retried every minute.
    await db.rpc("bot_mark_cfo_sent", { p_key: botKey(), p_workspace_id: r.workspace_id, p_today: now.day })
  }
  if (sent || idle) logEvent("info", "cfo-brief", `Weekly CFO brief sent to ${sent} owner${sent === 1 ? "" : "s"}${idle ? ` · ${idle} business${idle === 1 ? "" : "es"} with no activity this week skipped` : ""}`, { fold: true })
}

/** /cfo, /healthcheck: the brief now (this week so far), or why not. */
export async function sendCfoNow(chatId: number) {
  const { data, error } = await botDb().rpc("bot_cfo_for_chat", { p_key: botKey(), p_chat_id: chatId, p_today: phnomPenhToday().day })
  const r = data as { status: string; data?: CfoData } | null
  if (error || !r) return sendText(chatId, "សូមអភ័យទោស មិនអាចរៀបចំរបាយការណ៍បានទេ ពេលនេះ។")
  if (r.status === "group") return sendText(chatId, "🔒 របាយការណ៍សុខភាពហិរញ្ញវត្ថុ ផ្ញើតែក្នុងការជជែកផ្ទាល់ជាមួយ Bot ប៉ុណ្ណោះ។")
  if (r.status === "not_linked") return sendText(chatId, "🩺 សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។")
  if (r.status === "off")
    return sendText(chatId, "🔒 ដើម្បីការពារភាពឯកជន Bot មិនបង្ហាញតួលេខទេ។ បើក «ឱ្យ AI មើលលេខរបស់ខ្ញុំ» ក្នុងអេប លុយឆ្លាត › ការកំណត់ › Telegram ដើម្បីទទួលរបាយការណ៍នេះ។")
  if (r.status === "no_business" || !r.data) return sendText(chatId, "🩺 របាយការណ៍នេះសម្រាប់ម្ចាស់អាជីវកម្ម — មិនទាន់មានកន្លែងធ្វើការអាជីវកម្មដែលអ្នកជាម្ចាស់ទេ។")
  return sendText(chatId, buildCfoBrief(r.data), { parse_mode: "HTML", ...reportsButton })
}
