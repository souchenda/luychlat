// Server only: the end-of-day development report for super admins. At 23:59
// Cambodia time the day is finalized (bot_dev_eod stores a snapshot: what
// shipped + the open roadmap) and a short digest goes to the super admins'
// linked Telegram chats. A deploy at 23:59 is caught up just after midnight.
import { groupByArea } from "@/lib/dev-areas"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText } from "./telegram-bot"

type Report = {
  day: string
  commits: { hash: string; kind: string; scope: string | null; subject: string }[]
  roadmap: { title: string; area: string; status: string; priority: number }[]
  done_today: string[]
  security?: {
    traffic: { total: number; blocked: number; limited: number; peak_blocked_per_min: number; first_blocked: string | null; last_blocked: string | null }
    health: { max_cpu: number | null; max_ram: number | null; ok_pct: number | null }
    incidents: { issue: string; started_at: string; ended_at: string | null; minutes: number; peak: number | null }[]
  }
}

const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)
const num = (v: number) => Number(v).toLocaleString("en-US")

const AREA_LABEL: Record<string, string> = {
  accounts: "👤 Accounts",
  wallets: "👛 Wallets & Home",
  telegram: "🤖 Telegram bot & API",
  culture: "🌙 Culture & Bills",
  pools: "👥 Shared pools",
  security: "🔒 Security",
  admin: "🛠️ Admin & Ops",
  other: "📦 Other",
}
const PRIORITY = ["", "🔴", "🟡", "⚪"]
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The digest text (plain, under Telegram's limit). */
export function eodText(r: Report): string {
  const [y, m, d] = r.day.split("-")
  const feats = r.commits.filter((c) => c.kind === "feat").length
  const fixes = r.commits.filter((c) => c.kind === "fix").length
  const lines = [`📋 LuyChlat · End of day ${d}/${m}/${y}`, ""]
  if (r.commits.length === 0) lines.push("✅ Shipped: nothing deployed today.")
  else {
    lines.push(`✅ Shipped: ${r.commits.length} (${feats} features · ${fixes} fixes)`)
    for (const g of groupByArea(r.commits)) {
      lines.push("", `${AREA_LABEL[g.key] ?? g.key} (${g.items.length})`)
      for (const c of g.items.slice(0, 8)) lines.push(`• ${c.kind === "fix" ? "🔧 " : ""}${short(c.subject, 90)}`)
      if (g.items.length > 8) lines.push(`  … +${g.items.length - 8} more`)
    }
  }
  if (r.done_today.length) lines.push("", `☑️ Roadmap items done today: ${r.done_today.length}`)
  const sec = r.security
  if (sec) {
    const tr = sec.traffic
    lines.push("", `🛡️ Security & health · peak CPU ${sec.health.max_cpu ?? "–"}% · RAM ${sec.health.max_ram ?? "–"}% · healthy ${sec.health.ok_pct ?? "–"}%`)
    if (Number(tr.blocked) > 0) {
      const when = tr.first_blocked && tr.last_blocked ? ` (${hhmm(tr.first_blocked)}–${hhmm(tr.last_blocked)})` : ""
      lines.push(`• Blocked ${num(tr.blocked)} malicious requests${when}, peak ${num(tr.peak_blocked_per_min)}/min; rate-limited ${num(tr.limited)}`)
    } else lines.push("• No blocked attack traffic")
    for (const i of sec.incidents)
      lines.push(`• ${i.ended_at ? "✅" : "🔴"} ${i.issue.toUpperCase()}${i.peak != null ? ` peak ${i.peak}` : ""}: ${hhmm(i.started_at)} → ${i.ended_at ? hhmm(i.ended_at) : "ongoing"} (${i.minutes} min)`)
  }
  lines.push("", r.roadmap.length ? `⏭️ Next (${r.roadmap.length}):` : "⏭️ Next: nothing pending 🎉")
  for (const i of r.roadmap.slice(0, 10)) lines.push(`${i.status === "doing" ? "▶️" : PRIORITY[i.priority] ?? "•"} ${short(i.title, 100)}`)
  if (r.roadmap.length > 10) lines.push(`… +${r.roadmap.length - 10} more`)
  lines.push("", "Full report: Admin › Super › Development")
  const text = lines.join("\n")
  return text.length > 3900 ? `${text.slice(0, 3890)}\n…` : text
}

/** Called every minute by the dispatcher. */
export async function devEodTick() {
  const now = phnomPenhToday()
  let day: string | null = null
  if (now.hour === 23 && now.minute >= 59) day = now.day
  // Missed 23:59 (a deploy, a restart): finalize yesterday early the next morning.
  else if (now.hour === 0 && now.minute < 15) day = new Date(Date.parse(`${now.day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (!day) return

  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: "dev-eod", p_day: day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_dev_eod", { p_key: botKey(), p_day: day })
  if (error || !data) {
    logEvent("error", "dev-eod", `End-of-day report failed: ${error?.message ?? "no data"}`, { fold: true })
    return
  }
  const { data: chats } = await db.rpc("bot_admin_chats", { p_key: botKey() })
  const text = eodText(data as Report)
  for (const c of (chats as { chat_id: number }[] | null) ?? []) await sendText(Number(c.chat_id), text).catch(() => null)
  logEvent("info", "dev-eod", `End-of-day report ${day} sent`, { fold: true })
}
