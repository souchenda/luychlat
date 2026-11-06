// Server only: the function watch (founder, 6/11/2026) — feature faults, missed daily jobs, admin roster changes and a
// stopped scheduler, to the founder's private chat. The rules are lib/function-watch.ts; this file only feeds them, repairs
// what it can and sends. It runs on its OWN timer, not inside the dispatcher's pass, so a pass that hangs is still seen.
//   🔴 rings: money coming in failing, a scheduler the self-restart did not fix, the admin roster changed.
//   🟡 silent: every other fault, a missed job, «🟢 ល្អវិញ».
//   not sent: what repaired itself (a self-restart that worked) — one line in the 23:59 report.
import { readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"

import { evaluate, mayRestart, missedJobs, missedText, newState, quietHour, rosterText, schedulerOkText, schedulerState, schedulerText, type RosterChange } from "@/lib/function-watch"
import { founderChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { dispatcherExpected, heartbeat, recentEvents } from "@/lib/server/heartbeat"
import { botDb, botKey, maskNumbers, tg } from "@/lib/server/telegram-bot"

const state = newState()
let scheduler: { state: "stuck" | "stalled"; since: number } | null = null
/** The day's jobs already reported missing («id|day»). */
const reportedMissed = new Set<string>()
/** Alerts sent since Cambodia midnight, for the end-of-day health line. */
let today = { day: "", alerts: 0 }
let ticks = 0

const cambodiaDay = (at: number) => new Date(at + 7 * 3_600_000).toISOString().slice(0, 10)

export function faultsToday(now = Date.now()): number {
  return today.day === cambodiaDay(now) ? today.alerts : 0
}

/**
 * The self-restarts, kept in the container's /tmp: a `docker restart` (what `restart: unless-stopped` does after the
 * process exits) keeps it; a new deploy starts clean, as it should.
 */
type Heal = { restarts: number[]; healed: { day: string; n: number }; counted: number[] }
const HEAL_FILE = path.join(tmpdir(), "luychlat-self-heal.json")
function readHeal(): Heal {
  try {
    const h = JSON.parse(readFileSync(HEAL_FILE, "utf8")) as Partial<Heal>
    return { restarts: h.restarts ?? [], healed: h.healed ?? { day: "", n: 0 }, counted: h.counted ?? [] }
  } catch {
    return { restarts: [], healed: { day: "", n: 0 }, counted: [] }
  }
}
const writeHeal = (h: Heal) => {
  try {
    writeFileSync(HEAL_FILE, JSON.stringify(h))
  } catch {
    // a read-only /tmp: the restart still happens, it is only not counted
  }
}

/** What repaired itself today (a self-restart after which the scheduler ran again) — for the 23:59 report. */
export function healedToday(now = Date.now()): number {
  const h = readHeal()
  return h.healed.day === cambodiaDay(now) ? h.healed.n : 0
}

/** Sends to every founder chat; returns how many really received it (never a bare «sent»). Silent unless `loud`. */
async function send(text: string, now: number, loud = false): Promise<number> {
  let reached = 0
  for (const chat of await founderChats()) {
    const r = await tg("sendMessage", { chat_id: chat, text: maskNumbers(text), disable_web_page_preview: true, disable_notification: !loud || quietHour(now) }).catch(() => null)
    if (r?.ok) reached += 1
  }
  return reached
}

/** The scheduler: restart the app by itself first; only when that did not help (twice an hour), tell the founder. */
async function schedulerCheck(now: number) {
  const hb = heartbeat()
  const s = schedulerState(hb, now)
  if (s === "ok") {
    // A self-restart that worked: counted once as repaired, never sent.
    const h = readHeal()
    const fresh = h.restarts.filter((t) => t > hb.bootAt - 5 * 60_000 && !h.counted.includes(t))
    if (fresh.length && hb.passEnd) {
      const day = cambodiaDay(now)
      writeHeal({ ...h, counted: [...h.counted, ...fresh].slice(-20), healed: { day, n: (h.healed.day === day ? h.healed.n : 0) + 1 } })
      logEvent("info", "function-watch", "Self-restart repaired the scheduler")
    }
    if (scheduler) {
      scheduler = null
      const reached = await send(schedulerOkText, now)
      logEvent("info", "function-watch", `Scheduler ok again → ${reached} chat(s)`)
    }
    return
  }
  const since = s === "stuck" ? (hb.passStart ?? now) : (hb.passEnd ?? hb.bootAt)
  const h = readHeal()
  if (mayRestart(h.restarts, now)) {
    writeHeal({ ...h, restarts: [...h.restarts.filter((t) => now - t < 86_400_000), now] })
    logEvent("error", "function-watch", `Scheduler ${s} since ${new Date(since).toISOString()} — restarting the app by itself`)
    // Let the log line reach the database, then exit: Docker (restart: unless-stopped) starts the app again in seconds.
    setTimeout(() => process.exit(1), 3_000).unref?.()
    return
  }
  if (scheduler?.state === s) return
  scheduler = { state: s, since }
  const reached = await send(schedulerText(s, since), now, true)
  logEvent("error", "function-watch", `Scheduler ${s} since ${new Date(since).toISOString()}, self-restarts did not help → ${reached} chat(s)`)
}

/** Who holds an admin role: any change → 🔴 at once (the database keeps the last roster seen). */
async function rosterCheck(now: number) {
  const { data, error } = await botDb().rpc("bot_admin_roster_changes", { p_key: botKey() })
  if (error) return logEvent("warn", "function-watch", `Admin roster not read: ${error.message}`, { fold: true })
  const changes = (data as RosterChange[] | null) ?? []
  if (!changes.length) return
  const reached = await send(rosterText(changes), now, true)
  logEvent("security", "function-watch", `Admin roster changed (${changes.length}) → ${reached} chat(s)`)
}

let busy = false
export async function functionWatchTick() {
  if (busy) return
  busy = true
  try {
    const now = Date.now()
    let alerts = 0
    for (const m of evaluate(recentEvents(), now, state)) {
      const reached = await send(m.text, now, m.loud)
      if (m.kind !== "recovered") alerts += 1
      logEvent(reached ? "info" : "warn", "function-watch", `${m.kind} ${m.key ?? ""} → ${reached} chat(s)`)
    }
    if (dispatcherExpected()) {
      // The day's work that must go out: one alert a day for a job past its deadline with nothing logged.
      for (const x of missedJobs(recentEvents(), now, heartbeat().bootAt, reportedMissed)) {
        reportedMissed.add(`${x.id}|${cambodiaDay(now)}`)
        const reached = await send(missedText(x), now)
        alerts += 1
        logEvent("warn", "function-watch", `Missed job ${x.id} → ${reached} chat(s)`)
      }
      // The dead-man switch: the scheduler that runs every post, reminder and the machine watchdog.
      await schedulerCheck(now)
      if (ticks++ % 10 === 0) await rosterCheck(now)
    }
    if (alerts) {
      const day = cambodiaDay(now)
      today = { day, alerts: (today.day === day ? today.alerts : 0) + alerts }
    }
  } catch (e) {
    console.error("[function-watch]", (e as Error).message)
  } finally {
    busy = false
  }
}
