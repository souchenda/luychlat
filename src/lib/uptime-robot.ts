/**
 * UptimeRobot in Admin › Super › Control Center (founder, 5/11/2026 — «UptimeRobot beside the server's health»): the
 * monitors the founder set up there (the app, luychlat.com, …), read with his read-only API key (v2 getMonitors). Pure:
 * turns the API's answer into what the card shows (uptime-robot.test.ts).
 */
export type UptimeState = "UP" | "DOWN" | "PAUSED" | "PENDING"
export type UptimeMonitor = {
  name: string
  url: string
  state: UptimeState
  /** Uptime %, last 24 hours and last 7 days (null when not given). */
  day: number | null
  week: number | null
  /** Average response time in ms (null when not given). */
  responseMs: number | null
  /** The last time it went down, and for how long (seconds; null while still down or never). */
  lastDown: { at: string; seconds: number | null } | null
}

type RawLog = { type?: number; datetime?: number; duration?: number }
type RawMonitor = {
  friendly_name?: string
  url?: string
  status?: number
  custom_uptime_ratio?: string
  average_response_time?: string | number
  logs?: RawLog[]
}

/** v2 status: 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down. */
export function stateOf(status: number | undefined): UptimeState {
  if (status === 2) return "UP"
  if (status === 8 || status === 9) return "DOWN"
  if (status === 0) return "PAUSED"
  return "PENDING"
}

const pct = (s: string | undefined) => {
  const n = Number(s)
  return s !== undefined && s !== "" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function parseMonitors(json: unknown): UptimeMonitor[] | null {
  const body = json as { stat?: string; monitors?: RawMonitor[] } | null
  if (!body || body.stat !== "ok" || !Array.isArray(body.monitors)) return null
  return body.monitors.map((m) => {
    const [day, week] = (m.custom_uptime_ratio ?? "").split("-")
    const down = (m.logs ?? []).filter((l) => l.type === 1 && typeof l.datetime === "number").sort((a, b) => b.datetime! - a.datetime!)[0]
    const state = stateOf(m.status)
    const rt = Number(m.average_response_time)
    return {
      name: String(m.friendly_name ?? m.url ?? "—").slice(0, 80),
      url: String(m.url ?? ""),
      state,
      day: pct(day),
      week: pct(week),
      responseMs: m.average_response_time !== undefined && Number.isFinite(rt) ? Math.round(rt) : null,
      // Still down: the outage has no length yet.
      lastDown: down ? { at: new Date(down.datetime! * 1000).toISOString(), seconds: state === "DOWN" ? null : (down.duration ?? null) } : null,
    }
  })
}

/** «2 ម៉ោង 5 នាទី», «45 វិនាទី» — 0-9 digits. */
export function durationKm(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  if (d) return `${d} ថ្ងៃ${h ? ` ${h} ម៉ោង` : ""}`
  if (h) return `${h} ម៉ោង${m ? ` ${m} នាទី` : ""}`
  if (m) return `${m} នាទី`
  return `${s} វិនាទី`
}
