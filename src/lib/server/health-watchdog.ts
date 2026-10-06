// Server only: system health watchdog with Telegram alerts to the admins.
import fs from "fs"

import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { logEvent } from "@/lib/server/events"

/**
 * Runs every minute from the dispatcher (production only):
 *   - samples the Droplet's RAM and CPU (/proc shows the whole machine inside
 *     the container), disk space, the app container's memory against its
 *     limit, the database round trip and the Telegram webhook;
 *   - alerts admins who linked @luychlat_bot when RAM or CPU stays above 75%
 *     for 5 minutes, disk is above 85%, the app nears its memory limit, the
 *     database is slow or down, or the webhook reports errors — at most once
 *     per 30 minutes per issue, plus a "recovered" message when it clears
 *     for good (CPU below 60% / RAM below 65% for 3 minutes, other issues
 *     absent for 3 checks). Open alerts are kept in the database, so a deploy
 *     (a fresh process) still sends the recovery for an alert raised before it;
 *   - stores one sample every 5 minutes, and every Sunday at 19:00 (Cambodia)
 *     sends the weekly summary (uptime, response times, peaks).
 */

export type Issue = "ram" | "cpu" | "disk" | "app_mem" | "db_slow" | "db_down" | "webhook"
export type Sample = {
  ram_pct: number | null
  ram_total_gb: number | null
  cpu_pct: number | null
  disk_pct: number | null
  app_mem_pct: number | null
  app_mem_limit_mb: number | null
  db_ms: number | null
  tg_ms: number | null
  webhook_error: string | null
  /** Unix time of Telegram's last delivery error (to tell new errors from an old one). */
  webhook_error_at: number | null
  pending_updates: number | null
}

const startedAt = Date.now()

export const LIMITS = { ram: 75, cpu: 75, disk: 85, appMem: 85, dbSlowMs: 1500, sustainedMinutes: 5, cooldownMs: 30 * 60_000 }
/** Recovery needs a clear margin below the alert line, for a few minutes (no flapping). */
export const RECOVERY = { cpu: 60, ram: 65, minutes: 3 }

/**
 * Has an open issue cleared for good? CPU / RAM: the last RECOVERY.minutes
 * samples all below the recovery line. Others: absent from the last
 * RECOVERY.minutes checks (`clearStreak` = checks in a row without it).
 */
export function hasRecovered(issue: Issue, history: Sample[], clearStreak: number): boolean {
  if (issue === "cpu" || issue === "ram") {
    const key = issue === "cpu" ? "cpu_pct" : "ram_pct"
    const line = issue === "cpu" ? RECOVERY.cpu : RECOVERY.ram
    const window = history.slice(-RECOVERY.minutes)
    return window.length >= RECOVERY.minutes && window.every((s) => s[key] != null && (s[key] as number) < line)
  }
  return clearStreak >= RECOVERY.minutes
}

const readText = (path: string) => {
  try {
    return fs.readFileSync(path, "utf8")
  } catch {
    return null
  }
}

function ramPercent(): { pct: number | null; totalGb: number | null } {
  const info = readText("/proc/meminfo")
  if (!info) return { pct: null, totalGb: null }
  const kb = (key: string) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? NaN)
  const total = kb("MemTotal")
  const available = kb("MemAvailable")
  if (!(total > 0) || !(available >= 0)) return { pct: null, totalGb: null }
  return { pct: Math.round((1 - available / total) * 1000) / 10, totalGb: Math.round((total / 1024 / 1024) * 10) / 10 }
}

let lastCpu: { idle: number; total: number } | null = null
/** Machine-wide CPU % since the previous call (from /proc/stat). */
function cpuPercent(): number | null {
  const line = readText("/proc/stat")?.split("\n")[0]
  if (!line?.startsWith("cpu ")) return null
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0)
  const total = parts.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  const prev = lastCpu
  lastCpu = { idle, total }
  if (!prev || total <= prev.total) return null
  return Math.round((1 - (idle - prev.idle) / (total - prev.total)) * 1000) / 10
}

function diskPercent(): number | null {
  try {
    const s = fs.statfsSync("/")
    const used = (s.blocks - s.bfree) * s.bsize
    const usable = used + s.bavail * s.bsize
    return usable > 0 ? Math.round((used / usable) * 1000) / 10 : null
  } catch {
    return null
  }
}

/** The app container's memory against its limit (cgroup v2), when limited. */
function appMemory(): { pct: number | null; limitMb: number | null } {
  const current = Number(readText("/sys/fs/cgroup/memory.current"))
  const max = Number(readText("/sys/fs/cgroup/memory.max"))
  if (!(current > 0) || !(max > 0)) return { pct: null, limitMb: null }
  return { pct: Math.round((current / max) * 1000) / 10, limitMb: Math.round(max / 1024 / 1024) }
}

async function timed<T>(run: () => PromiseLike<T>): Promise<{ ms: number; value: T | null }> {
  const start = Date.now()
  try {
    const value = await run()
    return { ms: Date.now() - start, value }
  } catch {
    return { ms: Date.now() - start, value: null }
  }
}

export async function takeSample(): Promise<Sample> {
  const ram = ramPercent()
  const app = appMemory()
  const db = await timed(async () => {
    const { error } = await botDb().rpc("bot_ping", { p_key: botKey() })
    if (error) throw error
    return true
  })
  const webhook = await timed(() => tg<{ pending_update_count?: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo", {}))
  const info = webhook.value?.ok ? webhook.value.result : null
  // A webhook error in the last 10 minutes counts (older ones are history).
  const recentError = info?.last_error_date && Date.now() / 1000 - info.last_error_date < 600 ? (info.last_error_message ?? "error") : null
  return {
    ram_pct: ram.pct,
    ram_total_gb: ram.totalGb,
    cpu_pct: cpuPercent(),
    disk_pct: diskPercent(),
    app_mem_pct: app.pct,
    app_mem_limit_mb: app.limitMb,
    db_ms: db.value ? db.ms : null,
    tg_ms: webhook.value?.ok ? webhook.ms : null,
    webhook_error: recentError,
    webhook_error_at: info?.last_error_date ?? null,
    pending_updates: info?.pending_update_count ?? null,
  }
}

/** Issues in the latest sample, with RAM / CPU only when high for the whole recent window. */
export function findIssues(history: Sample[]): Issue[] {
  const latest = history[history.length - 1]
  if (!latest) return []
  const issues: Issue[] = []
  const window = history.slice(-LIMITS.sustainedMinutes)
  const sustained = (key: "ram_pct" | "cpu_pct", limit: number) =>
    window.length >= LIMITS.sustainedMinutes && window.every((s) => s[key] != null && (s[key] as number) > limit)
  if (sustained("ram_pct", LIMITS.ram)) issues.push("ram")
  if (sustained("cpu_pct", LIMITS.cpu)) issues.push("cpu")
  if (latest.disk_pct != null && latest.disk_pct > LIMITS.disk) issues.push("disk")
  if (latest.app_mem_pct != null && latest.app_mem_pct > LIMITS.appMem) issues.push("app_mem")
  // Two failed / slow pings in a row, so one network blip doesn't page anyone.
  const previous = history[history.length - 2]
  if (latest.db_ms == null && previous && previous.db_ms == null) issues.push("db_down")
  else if (latest.db_ms != null && latest.db_ms > LIMITS.dbSlowMs && (previous?.db_ms ?? 0) > LIMITS.dbSlowMs) issues.push("db_slow")
  // Webhook: updates piling up, or new delivery errors in at least 2 of the last 3 minutes.
  // A deploy restart causes one error, so the first 10 minutes after start don't count.
  const recent = history.slice(-3)
  const newErrors = recent.filter((s, i) => s.webhook_error && i > 0 && s.webhook_error_at !== recent[i - 1].webhook_error_at).length
  if (Date.now() - startedAt > 10 * 60_000 && ((latest.pending_updates ?? 0) > 20 || newErrors >= 2)) issues.push("webhook")
  return issues
}

/** Next DigitalOcean size up for the RAM advice (1 → 2 → 4 → 8 → 16 GB). */
const nextSize = (gb: number | null) => {
  const sizes = [1, 2, 4, 8, 16, 32]
  const now = sizes.find((s) => (gb ?? 0) <= s + 0.5) ?? 4
  return { now, next: sizes[sizes.indexOf(now) + 1] ?? now * 2 }
}

export function alertText(issue: Issue, s: Sample): string {
  const size = nextSize(s.ram_total_gb)
  const body: Record<Issue, [string, string]> = {
    ram: [`RAM usage: ${s.ram_pct}% for ${LIMITS.sustainedMinutes}+ minutes (high traffic or a heavy process).`, `Log into DigitalOcean and resize the Droplet (${size.now} GB → ${size.next} GB) to prevent slowdowns.`],
    cpu: [`CPU usage: ${s.cpu_pct}% for ${LIMITS.sustainedMinutes}+ minutes.`, `Resize the Droplet to more vCPUs in DigitalOcean, or check for a runaway process (other sites share this Droplet).`],
    disk: [`Disk usage: ${s.disk_pct}%.`, `Free space on the Droplet: \`docker system prune -af\` removes old images. If it stays high, add a volume or resize the disk in DigitalOcean.`],
    app_mem: [`App memory: ${s.app_mem_pct}% of its ${s.app_mem_limit_mb} MB limit.`, `Raise APP_MEMORY in /opt/luysmart/.env (e.g. APP_MEMORY=768m); it redeploys within 5 minutes.`],
    db_slow: [`Database response: ${s.db_ms} ms (normally well under ${LIMITS.dbSlowMs} ms).`, `Check status.supabase.com and the Supabase dashboard (usage and plan limits).`],
    db_down: [`The database didn't answer.`, `Check status.supabase.com and the Supabase project (paused or over quota?).`],
    webhook: [`Telegram webhook: ${s.webhook_error ?? `${s.pending_updates} updates waiting`}.`, `Check that the site is reachable (Nginx and the luysmart container: \`docker compose ps\`); the bot re-activates on the next deploy.`],
  }
  const [what, action] = body[issue]
  return `🚨 LuyChlat System Health Alert!\n- ${what}\n- Recommended action: ${action}`
}

const RECOVERED: Record<Issue, (s: Sample) => string> = {
  ram: (s) => `RAM usage returned to normal (${s.ram_pct}%)`,
  cpu: (s) => `CPU usage returned to normal (${s.cpu_pct}%)`,
  disk: (s) => `Disk space is back below the limit (${s.disk_pct}%)`,
  app_mem: (s) => `App memory returned to normal (${s.app_mem_pct}%)`,
  db_slow: (s) => `Database response is back to normal (${s.db_ms} ms)`,
  db_down: () => "The database is answering again",
  webhook: () => "The Telegram webhook is healthy again",
}

const ISSUE_NAME: Record<Issue, string> = { ram: "RAM", cpu: "CPU", disk: "disk", app_mem: "app memory", db_slow: "database speed", db_down: "database", webhook: "Telegram webhook" }

/** "✅ LuyChlat System Health Recovered: CPU usage returned to normal (12%). All services are healthy." */
export function recoveredText(issue: Issue, s: Sample, stillOpen: Issue[]): string {
  const rest = stillOpen.length ? `Still being watched: ${stillOpen.map((i) => ISSUE_NAME[i]).join(", ")}.` : "All services are healthy."
  return `✅ LuyChlat System Health Recovered: ${RECOVERED[issue](s)}. ${rest}`
}

async function sendToAdmins(text: string) {
  const { data } = await botDb().rpc("bot_admin_chats", { p_key: botKey() })
  for (const row of (data as { chat_id: number }[] | null) ?? []) {
    await tg("sendMessage", { chat_id: row.chat_id, text, disable_web_page_preview: true })
  }
}

const history: Sample[] = []
/** Open alerts (issue → when last alerted), shared with the database so deploys don't lose them. */
const lastAlert = new Map<Issue, number>()
const clearStreak = new Map<Issue, number>()
let loaded = false
let ticks = 0

/** Open alerts raised by an earlier process (before a deploy). */
async function loadOpenAlerts() {
  const { data, error } = await botDb().rpc("bot_health_alerts", { p_key: botKey() })
  if (error) return
  for (const [issue, at] of Object.entries((data as Record<string, string> | null) ?? {})) lastAlert.set(issue as Issue, Date.parse(at) || Date.now())
  loaded = true
}

/** Once a minute. */
export async function watchdogTick() {
  if (!loaded) await loadOpenAlerts()
  const sample = await takeSample()
  history.push(sample)
  if (history.length > 30) history.shift()
  const issues = findIssues(history)

  for (const issue of issues) {
    clearStreak.set(issue, 0)
    const last = lastAlert.get(issue) ?? 0
    if (Date.now() - last >= LIMITS.cooldownMs) {
      lastAlert.set(issue, Date.now())
      await botDb().rpc("bot_health_alert_set", { p_key: botKey(), p_issue: issue, p_open: true })
      await sendToAdmins(alertText(issue, sample))
      logEvent("warn", "watchdog", `Alert: ${issue} (RAM ${sample.ram_pct}%, CPU ${sample.cpu_pct}%, disk ${sample.disk_pct}%, DB ${sample.db_ms ?? "–"} ms)`)
    }
  }
  // An open alert clears once it has really recovered (margin + a few minutes), with one message.
  for (const issue of [...lastAlert.keys()]) {
    if (issues.includes(issue)) continue
    clearStreak.set(issue, (clearStreak.get(issue) ?? 0) + 1)
    if (!hasRecovered(issue, history, clearStreak.get(issue) ?? 0)) continue
    lastAlert.delete(issue)
    clearStreak.delete(issue)
    await botDb().rpc("bot_health_alert_set", { p_key: botKey(), p_issue: issue, p_open: false })
    await sendToAdmins(recoveredText(issue, sample, [...lastAlert.keys()]))
    logEvent("info", "watchdog", `Recovered: ${issue}`)
  }

  // One stored sample every 5 minutes (also the uptime record).
  if (ticks++ % 5 === 0) {
    await botDb().rpc("bot_record_health", {
      p_key: botKey(),
      p_sample: { ok: issues.length === 0, ram_pct: sample.ram_pct, cpu_pct: sample.cpu_pct, disk_pct: sample.disk_pct, app_mem_pct: sample.app_mem_pct, db_ms: sample.db_ms, tg_ms: sample.tg_ms, issues },
    })
  }
  await weeklySummary()
}

type Summary = {
  samples: number
  slots: number
  uptime_pct: number | null
  avg_db_ms: number | null
  p95_db_ms: number | null
  avg_tg_ms: number | null
  max_ram_pct: number | null
  avg_ram_pct: number | null
  max_cpu_pct: number | null
  avg_cpu_pct: number | null
  last_disk_pct: number | null
  issues: string[]
}

export function summaryText(s: Summary): string {
  const healthy = (s.uptime_pct ?? 0) >= 99 && !s.issues.length
  return [
    `📊 LuyChlat weekly health · ${healthy ? "✅ Healthy" : "⚠️ Needs a look"}`,
    `- Uptime: ${s.uptime_pct ?? 0}% (${s.samples} of ${s.slots} checks)`,
    `- Database response: avg ${s.avg_db_ms ?? "–"} ms, p95 ${s.p95_db_ms ?? "–"} ms`,
    `- Telegram API: avg ${s.avg_tg_ms ?? "–"} ms`,
    `- RAM: avg ${s.avg_ram_pct ?? "–"}%, peak ${s.max_ram_pct ?? "–"}%`,
    `- CPU: avg ${s.avg_cpu_pct ?? "–"}%, peak ${s.max_cpu_pct ?? "–"}%`,
    `- Disk: ${s.last_disk_pct ?? "–"}%`,
    s.issues.length ? `- Issues this week: ${s.issues.join(", ")}` : "- No alerts this week 🎉",
  ].join("\n")
}

/** Sundays at 19:00 Cambodia time, once (bot_claim_daily). */
async function weeklySummary() {
  const t = new Date(Date.now() + 7 * 3_600_000)
  if (t.getUTCDay() !== 0 || t.getUTCHours() !== 19) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "weekly-health", p_day: t.toISOString().slice(0, 10) })
  if (claimed !== true) return
  const { data } = await botDb().rpc("bot_health_summary", { p_key: botKey(), p_days: 7 })
  if (data) await sendToAdmins(summaryText(data as Summary))
}
