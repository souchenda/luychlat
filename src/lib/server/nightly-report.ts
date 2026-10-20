// Server only: the nightly report before midnight (founder, 19/10/2026) — at 23:30 Cambodia time (or as soon as the
// server is up inside 23:30–23:59), once a day, to «LCA Approval» (else the marketing chat, else the founder's chat):
// the server's health, today's new members and approvals. Counts only.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { MORNING_BRIEFING, morningBriefingText, nightlyReportDay, nightlyReportText } from "@/lib/nightly-report"
import { dailyScorecard, parseRoadmap, summaryParts } from "@/lib/roadmap-scorecard"
import { curate, paginate } from "@/lib/report-standard"
import { founderChats } from "./admin-routes"
import { logEvent } from "./events"
import { diskFreeGb, findIssues, takeSample } from "./health-watchdog"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, tg } from "./telegram-bot"

export async function nightlyReportTick() {
  const now = phnomPenhToday()
  await morningBriefingTick(now)
  const day = nightlyReportDay(now.day, now.hour, now.minute)
  if (!day) return
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: "nightly-report", p_day: day })
  if (claimed !== true) return
  await sendNightlyReport(day)
}

/** The one-off morning briefing to the founder's chat (MORNING_BRIEFING), once. */
async function morningBriefingTick(now: { day: string; hour: number; minute: number }) {
  const minute = now.hour * 60 + now.minute
  if (now.day !== MORNING_BRIEFING.day || minute < MORNING_BRIEFING.fromMinute || minute >= MORNING_BRIEFING.untilMinute) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "morning-briefing", p_day: now.day })
  if (claimed !== true) return
  const sample = await takeSample()
  const text = morningBriefingText({ healthy: findIssues([sample]).length === 0, diskFreeGb: diskFreeGb() })
  let sent = 0
  for (const chat of await founderChats()) if ((await tg("sendMessage", { chat_id: chat, text })).ok) sent++
  logEvent(sent ? "info" : "warn", "nightly-report", `Morning briefing ${now.day} sent to ${sent} chat(s)`)
}

/** Builds and sends the card; the number of chats that received it is logged (never a silent «sent»). */
/** Builds and sends the card; the number of chats that received it is logged (never a silent «sent»). */
export async function sendNightlyReport(day: string): Promise<number> {
  const sample = await takeSample()
  const { data } = await botDb().rpc("bot_nightly_stats", { p_key: botKey(), p_day: day })
  const stats = (data as { new_users?: number; approvals?: number; by_approver?: { name?: string | null; count?: number }[] } | null) ?? {}
  const issues = findIssues([sample])
  // The executive summary (founder, 21/10/2026 — lib/report-standard.ts): 3–5 highlights from ROADMAP.md items finished
  // today and the exact count of today's other commits, one health line, then only the founder's actions.
  const card = await taskScorecard(day)
  const text = nightlyReportText({
    day,
    healthy: issues.length === 0,
    issues,
    diskFreeGb: diskFreeGb(),
    diskPct: sample.disk_pct,
    ramPct: sample.ram_pct,
    ramTotalGb: sample.ram_total_gb,
    newUsers: Number(stats.new_users ?? 0),
    approvals: Number(stats.approvals ?? 0),
    staff: (stats.by_approver ?? []).map((p) => ({ name: p.name?.trim() || "—", count: Number(p.count ?? 0) })),
    dockerOk: sample.db_ms !== null,
    webhookOk: !sample.webhook_error,
    ...card,
  })
  const pages = paginate(text)
  let sent = 0
  // The founder's private chat only — never «LCA Approval» (an approval queue, founder 20/10/2026). A chat counts as
  // reached only when every part arrived.
  for (const chat of await founderChats()) {
    let all = true
    for (const page of pages) {
      const res = await tg("sendMessage", { chat_id: chat, text: page, disable_web_page_preview: true })
      if (res.ok) continue
      all = false
      logEvent("error", "nightly-report", `Nightly report not delivered: ${res.description ?? "?"}`, { fold: true })
      break
    }
    if (all) sent++
  }
  logEvent(sent ? "info" : "warn", "nightly-report", `Nightly report ${day} (${pages.length} part(s)) sent to ${sent} chat(s)`)
  return sent
}

type Card = { highlights?: string[]; patches?: number; actions?: string[]; others?: { verify: number; external: number; engineering: number }; note?: string }

/** Today's highlights, other commits and the founder's actions; when they cannot be read, the report says so. */
async function taskScorecard(day: string): Promise<Card> {
  const file = path.join(process.cwd(), "ROADMAP.md")
  if (!existsSync(file)) {
    logEvent("warn", "nightly-report", "Daily summary: ROADMAP.md is not in the image", { fold: true })
    return { note: "⚠️ ROADMAP.md could not be read — highlights and actions missing" }
  }
  const { data, error } = await botDb().rpc("bot_deployed_hashes", { p_key: botKey(), p_day: day })
  if (error) {
    logEvent("warn", "nightly-report", `Daily summary: ${error.message}`, { fold: true })
    return { note: "⚠️ Today's deploys could not be read — highlights missing" }
  }
  const commits = (data as string[] | null) ?? []
  const parts = summaryParts(dailyScorecard(parseRoadmap(readFileSync(file, "utf8")), commits))
  return { ...curate(parts.done, [], commits), actions: parts.actions, others: parts.others }
}
