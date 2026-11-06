// Server only: the function watch (founder, 6/11/2026) — feature faults and a stopped scheduler, to the founder's private
// chat. The rules are lib/function-watch.ts; this file only feeds them and sends. It runs on its OWN timer, not inside the
// dispatcher's pass, so a pass that hangs is still reported.
import { evaluate, newState, quietHour, schedulerOkText, schedulerState, schedulerText } from "@/lib/function-watch"
import { founderChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { dispatcherExpected, heartbeat, recentEvents } from "@/lib/server/heartbeat"
import { maskNumbers, tg } from "@/lib/server/telegram-bot"

const state = newState()
let scheduler: { state: "stuck" | "stalled"; since: number } | null = null
/** Alerts sent since Cambodia midnight, for the end-of-day health line. */
let today = { day: "", alerts: 0 }

const cambodiaDay = (at: number) => new Date(at + 7 * 3_600_000).toISOString().slice(0, 10)

export function faultsToday(now = Date.now()): number {
  return today.day === cambodiaDay(now) ? today.alerts : 0
}

/** Sends to every founder chat; returns how many really received it (never a bare «sent»). */
async function send(text: string, now: number): Promise<number> {
  let reached = 0
  for (const chat of await founderChats()) {
    const r = await tg("sendMessage", { chat_id: chat, text: maskNumbers(text), disable_web_page_preview: true, disable_notification: quietHour(now) }).catch(() => null)
    if (r?.ok) reached += 1
  }
  return reached
}

let busy = false
export async function functionWatchTick() {
  if (busy) return
  busy = true
  try {
    const now = Date.now()
    let alerts = 0
    for (const m of evaluate(recentEvents(), now, state)) {
      const reached = await send(m.text, now)
      if (m.kind !== "recovered") alerts += 1
      logEvent(reached ? "info" : "warn", "function-watch", `${m.kind} ${m.key ?? ""} → ${reached} chat(s)`)
    }
    if (alerts) {
      const day = cambodiaDay(now)
      today = { day, alerts: (today.day === day ? today.alerts : 0) + alerts }
    }
    // The dead-man switch: the scheduler that runs every post, reminder and the machine watchdog.
    if (dispatcherExpected()) {
      const s = schedulerState(heartbeat(), now)
      if (s !== "ok" && scheduler?.state !== s) {
        const hb = heartbeat()
        const since = s === "stuck" ? (hb.passStart ?? now) : (hb.passEnd ?? hb.bootAt)
        scheduler = { state: s, since }
        const reached = await send(schedulerText(s, since), now)
        logEvent("error", "function-watch", `Scheduler ${s} since ${new Date(since).toISOString()} → ${reached} chat(s)`)
      } else if (s === "ok" && scheduler) {
        scheduler = null
        const reached = await send(schedulerOkText, now)
        logEvent("info", "function-watch", `Scheduler ok again → ${reached} chat(s)`)
      }
    }
  } catch (e) {
    console.error("[function-watch]", (e as Error).message)
  } finally {
    busy = false
  }
}
