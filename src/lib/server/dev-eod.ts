// Server only: the end-of-day development report for super admins. At 23:59
// Cambodia time the day is finalized (bot_dev_eod stores a snapshot: what
// shipped + the open roadmap) and a short digest goes to the super admins'
// linked Telegram chats. A deploy at 23:59 is caught up just after midnight.
import { groupByArea } from "@/lib/dev-areas"
import { highlights, ownerTag, paginate, pendingSections, type PendingItem } from "@/lib/report-standard"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText } from "./telegram-bot"
import { founderChats } from "@/lib/server/admin-routes"

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
const PRIORITY = ["", "🔴 ", "🟡 ", "⚪ "]

/** An open roadmap item on the Reporting Standard: a «⛔ 🟡 …» tag in its title names its owner; otherwise engineering's. */
function pendingOf(i: Report["roadmap"][number]): PendingItem {
  const [title, ...reason] = i.title.split("⛔")
  const tagged = reason.length ? ownerTag(reason.join("⛔")) : null
  const prefix = i.status === "doing" ? "▶️ " : (PRIORITY[i.priority] ?? "")
  if (tagged) return { title: `${prefix}${title.trim()}`, ...tagged }
  return { title: `${prefix}${title.trim()}`, owner: "engineering", action: reason.length ? reason.join("⛔").trim() : i.status === "doing" ? "បញ្ចប់ការអភិវឌ្ឍ" : "ចាប់ផ្ដើមអភិវឌ្ឍ" }
}

/**
 * The digest on the Reporting Standard (lib/report-standard.ts): the day's ✅ key accomplishments first, every commit by
 * area, security and health, then every open item numbered in its owner's section — nothing cut (sent as parts).
 */
export function eodText(r: Report): string {
  const [y, m, d] = r.day.split("-")
  const feats = r.commits.filter((c) => c.kind === "feat")
  const fixes = r.commits.filter((c) => c.kind === "fix")
  const lines = [`📋 App Luy Chlat · End of day ${d}/${m}/${y}`, ""]
  if (r.commits.length === 0) lines.push("✅ Shipped: nothing deployed today.")
  else {
    lines.push(...highlights([...feats, ...fixes, ...r.commits.filter((c) => c.kind !== "feat" && c.kind !== "fix")].map((c) => c.subject)))
    lines.push("", `🚀 Shipped: ${r.commits.length} (${feats.length} features · ${fixes.length} fixes)`)
    for (const g of groupByArea(r.commits)) {
      lines.push("", `${AREA_LABEL[g.key] ?? g.key} (${g.items.length})`)
      for (const c of g.items) lines.push(`• ${c.kind === "fix" ? "🔧 " : ""}${c.subject}`)
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
  lines.push("", ...pendingSections(r.roadmap.map(pendingOf)))
  lines.push("", "Full report: Admin › Super › Development")
  return lines.join("\n")
}

/** Called every minute by the dispatcher. */
export async function devEodTick() {
  const now = phnomPenhToday()
  let day: string | null = null
  if (now.hour === 23 && now.minute >= 59) day = now.day
  // Missed 23:59 (a deploy, a restart): finalize yesterday early the next morning (until 06:00; claimed once a day).
  else if (now.hour < 6) day = new Date(Date.parse(`${now.day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (!day) return

  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: "dev-eod", p_day: day })
  if (claimed !== true) return
  const { data, error } = await db.rpc("bot_dev_eod", { p_key: botKey(), p_day: day })
  if (error || !data) {
    logEvent("error", "dev-eod", `End-of-day report failed: ${error?.message ?? "no data"}`, { fold: true })
    return
  }
  // The DevOps chat, else the founder's chat (founder, 19/10/2026 — with no DevOps chat set it went nowhere while the
  // log said «sent»). The log counts the chats that really received every part (never cut — the Reporting Standard).
  const pages = paginate(eodText(data as Report))
  let sent = 0
  for (const chat of await founderChats()) {
    let all = true
    for (const page of pages) if (!(await sendText(chat, page).catch(() => null))?.ok) { all = false; break }
    if (all) sent++
  }
  logEvent(sent ? "info" : "warn", "dev-eod", `End-of-day report ${day} (${pages.length} part(s)) sent to ${sent} chat(s)`, { fold: true })
}
