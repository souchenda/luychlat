// Server only: a small event log for /admin › System health (server_events).
import { botDb, botKey } from "@/lib/server/telegram-bot"

export type EventLevel = "info" | "warn" | "error" | "security"

/** Repeats of the same event within this window are folded into one row with a count. */
const FOLD_MS = 10 * 60_000
const pending = new Map<string, { level: EventLevel; source: string; message: string; count: number; since: number }>()

async function write(level: EventLevel, source: string, message: string, count = 1) {
  if (!botKey()) return
  try {
    await botDb().rpc("bot_log_event", { p_key: botKey(), p_level: level, p_source: source, p_message: message, p_count: count })
  } catch {
    // Logging must never break the caller.
  }
}

/**
 * Record an event. With `fold`, repeats of the same source + message within 10
 * minutes become one row with a count (e.g. a burst of rejected webhook calls,
 * a feed failing every sync), so the log can't be flooded.
 */
export function logEvent(level: EventLevel, source: string, message: string, opts: { fold?: boolean } = {}) {
  if (!opts.fold) return void write(level, source, message)
  const key = `${level}|${source}|${message}`
  const entry = pending.get(key)
  if (entry) {
    entry.count += 1
    return
  }
  // First occurrence is written at once; repeats are summed and written when the window ends.
  pending.set(key, { level, source, message, count: 0, since: Date.now() })
  void write(level, source, message)
  setTimeout(() => {
    const done = pending.get(key)
    pending.delete(key)
    if (done && done.count > 0) void write(done.level, done.source, `${done.message} (×${done.count} more in 10 min)`, done.count)
  }, FOLD_MS).unref?.()
}
