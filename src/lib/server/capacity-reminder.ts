// Once an hour: is any capacity item at «act»? Then one Telegram message to the founder per item (again after 7 days if
// it is still there) — founder, 28/10/2026: «I don't want to spend before it's needed; remind me when it's time».
// The limits and the wording: lib/capacity.ts. Never fails the bot's minute.
import { type Capacity, capacityItems, dueReminders, reminderText } from "@/lib/capacity"
import { devopsChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"

export async function capacityTick(now = Date.now()) {
  // At 09:05 Cambodia time and then every hour at :05 — a quiet, readable hour, not a minute-by-minute alarm.
  if (new Date(now).getUTCMinutes() !== 5) return
  try {
    const { data: summary } = await botDb().rpc("bot_ops_summary", { p_key: botKey() })
    const capacity = (summary as { capacity?: Capacity } | null)?.capacity ?? null
    const today = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10)
    const items = capacityItems(capacity, today)
    const { data: sent } = await botDb().rpc("bot_capacity_reminders", { p_key: botKey() })
    const due = dueReminders(items, (sent ?? {}) as Record<string, { level: string; sent_at: string }>, now)
    if (!due.length) return
    const chats = await devopsChats({ critical: true })
    for (const item of due) {
      let reached = 0
      for (const chat of chats) {
        const r = await tg("sendMessage", { chat_id: chat, text: reminderText(item), disable_web_page_preview: true })
        if (r.ok) reached++
      }
      // Remembered only once someone really received it (no silent «sent» — CLAUDE.md, post-deploy rule 6).
      if (reached > 0) await botDb().rpc("bot_capacity_mark", { p_key: botKey(), p_item: item.key, p_level: item.level })
      logEvent("info", "capacity", `Reminder ${item.key} (${item.pct ?? "-"}%) reached ${reached} chat(s)`)
    }
  } catch (e) {
    logEvent("warn", "capacity", `Capacity check failed: ${(e as Error).message}`)
  }
}
