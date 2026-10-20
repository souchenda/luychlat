// Server only: the end-of-day development report for super admins. At 23:59
// Cambodia time the day is finalized (bot_dev_eod stores a snapshot: what
// shipped + the open roadmap) and a short digest goes to the super admins'
// linked Telegram chats. A deploy at 23:59 is caught up just after midnight.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { dailyScorecard, parseRoadmap, summaryParts } from "@/lib/roadmap-scorecard"
import { curate, executiveSummary, healthLine, paginate, type Health, type Shipped } from "@/lib/report-standard"

import { logEvent } from "./events"
import { diskFreeGb, findIssues, takeSample } from "./health-watchdog"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText } from "./telegram-bot"
import { founderChats } from "@/lib/server/admin-routes"

export type Report = {
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

/** What the digest adds to the snapshot: ROADMAP.md (finished today, the founder's actions) and the server now. */
export type EodExtras = {
  done: Shipped[]
  actions: string[]
  others?: { verify: number; external: number; engineering: number }
  now: Omit<Health, "okPct">
}

/**
 * The digest on the Reporting Standard — an executive summary (founder, 21/10/2026: «do NOT list all 70 commits»):
 * 3–5 highlights and «(+ X technical patches & fixes under the hood)», one health line (no CPU-peak lines), then the
 * founder's actions only. The full commit list stays in Admin › Super › Development.
 */
export function eodText(r: Report, x: EodExtras): string {
  const [y, m, d] = r.day.split("-")
  const features = r.commits.filter((c) => c.kind === "feat").map((c) => ({ hash: c.hash, subject: c.subject }))
  const { highlights, patches } = curate(x.done, features, r.commits.map((c) => c.hash))
  const open = r.security?.incidents.filter((i) => !i.ended_at).length ?? 0
  const health = healthLine({ ...x.now, okPct: r.security?.health.ok_pct ?? null, healthy: x.now.healthy && open === 0, issues: [...(x.now.issues ?? []), ...(open ? [`${open} incident${open === 1 ? "" : "s"} open`] : [])] })
  return executiveSummary({
    title: `App Luy Chlat · End of Day ${d}/${m}/${y}`,
    highlights,
    patches,
    health,
    actions: x.actions,
    others: x.others,
    footer: "Full log: Admin › Super › Development",
  })
}

/** ROADMAP.md's items finished on `day` and the founder's actions; empty when the file is not in the image. */
function roadmapExtras(commits: string[]): Pick<EodExtras, "done" | "actions" | "others"> {
  const file = path.join(process.cwd(), "ROADMAP.md")
  if (!existsSync(file)) {
    logEvent("warn", "dev-eod", "ROADMAP.md is not in the image: highlights come from feature commits only", { fold: true })
    return { done: [], actions: [] }
  }
  const parts = summaryParts(dailyScorecard(parseRoadmap(readFileSync(file, "utf8")), commits))
  return { done: parts.done, actions: parts.actions, others: parts.others }
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
  const report = data as Report
  const sample = await takeSample()
  const issues = findIssues([sample])
  const text = eodText(report, {
    ...roadmapExtras(report.commits.map((c) => c.hash)),
    now: { healthy: issues.length === 0, issues, diskFreeGb: diskFreeGb(), ramPct: sample.ram_pct, webhookOk: !sample.webhook_error },
  })
  // The DevOps chat, else the founder's chat (founder, 19/10/2026 — with no DevOps chat set it went nowhere while the
  // log said «sent»). The log counts the chats that really received every part.
  const pages = paginate(text)
  let sent = 0
  for (const chat of await founderChats()) {
    let all = true
    for (const page of pages) {
      if ((await sendText(chat, page).catch(() => null))?.ok) continue
      all = false
      break
    }
    if (all) sent++
  }
  logEvent(sent ? "info" : "warn", "dev-eod", `End-of-day report ${day} (${pages.length} part(s)) sent to ${sent} chat(s)`, { fold: true })
}
