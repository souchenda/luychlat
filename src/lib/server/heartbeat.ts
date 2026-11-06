// Server only: the scheduler's heartbeat and the in-memory event feed the function watch reads (lib/function-watch.ts).
// Kept on globalThis: instrumentation (the dispatcher) and the route handlers (/api/health) may be separate bundles of the
// same process, and both must see one heartbeat.
import { readFileSync } from "fs"

import { KEEP_MAX, KEEP_MS, type Heartbeat, type Level, type WatchEvent } from "@/lib/function-watch"

type Shared = { hb: Heartbeat; events: WatchEvent[] }
const g = globalThis as { __luyWatch?: Shared }
const shared = (): Shared => (g.__luyWatch ??= { hb: { bootAt: Date.now(), passStart: null, passEnd: null }, events: [] })

export const heartbeat = (): Heartbeat => shared().hb
export const passStarted = () => void (shared().hb.passStart = Date.now())
export const passEnded = () => void (shared().hb.passEnd = Date.now())

/** Every logEvent call, folded or not (a fold hides repeats from the log, not from the watch). */
export function noteEvent(level: Level, source: string, message: string) {
  const s = shared()
  const now = Date.now()
  s.events.push({ at: now, level, source, message })
  if (s.events.length > KEEP_MAX || s.events[0].at < now - KEEP_MS) s.events = s.events.filter((e) => now - e.at < KEEP_MS).slice(-KEEP_MAX)
}
export const recentEvents = (): WatchEvent[] => shared().events

/** Is the scheduler meant to run here? Production with the dispatcher on, a bot token, and the live slot. */
export function dispatcherExpected(): boolean {
  if (process.env.NODE_ENV !== "production" || process.env.BOT_DISPATCHER !== "on" || !process.env.TELEGRAM_BOT_TOKEN?.trim()) return false
  return isActiveSlot()
}

/**
 * Zero-downtime deploys run two containers for a moment (blue / green). Only the one Nginx points at — named in
 * deploy/run/active-slot, mounted at /run/luysmart — sends reminders and posts, so nothing goes out twice. No file (a
 * single container, local runs) means active.
 */
export function isActiveSlot() {
  try {
    const active = readFileSync("/run/luysmart/active-slot", "utf8").trim()
    return !active || active === (process.env.APP_SLOT || "blue")
  } catch {
    return true
  }
}
