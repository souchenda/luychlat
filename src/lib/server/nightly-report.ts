// Server only: the nightly report before midnight (founder, 19/10/2026) — at 23:30 Cambodia time (or as soon as the
// server is up inside 23:30–23:59), once a day, to «LCA Approval» (else the marketing chat, else the founder's chat):
// the server's health, today's new members and approvals. Counts only.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { MORNING_BRIEFING, morningBriefingText, nightlyReportDay, nightlyReportText } from "@/lib/nightly-report"
import { dailyScorecard, parseRoadmap, scorecardText } from "@/lib/roadmap-scorecard"
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
export async function sendNightlyReport(day: string): Promise<number> {
  const sample = await takeSample()
  const { data } = await botDb().rpc("bot_nightly_stats", { p_key: botKey(), p_day: day })
  const stats = (data as { new_users?: number; approvals?: number; by_approver?: { name?: string | null; count?: number }[] } | null) ?? {}
  const issues = findIssues([sample])
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
  })
  // The Daily Task Scorecard (founder, 20/10/2026): today's completed and stuck items from ROADMAP.md and today's deploys.
  const scorecard = await taskScorecard(day)
  const full = scorecard ? `${text}\n\n${scorecard}` : text
  let sent = 0
  // The founder's private chat only — never «LCA Approval» (an approval queue, founder 20/10/2026).
  for (const chat of await founderChats()) {
    const res = await tg("sendMessage", { chat_id: chat, text: full.length > 4000 ? `${full.slice(0, 3990)}\n…` : full, disable_web_page_preview: true })
    if (res.ok) sent++
    else logEvent("error", "nightly-report", `Nightly report not delivered: ${res.description ?? "?"}`, { fold: true })
  }
  logEvent(sent ? "info" : "warn", "nightly-report", `Nightly report ${day} sent to ${sent} chat(s)`)
  return sent
}

/** The scorecard text, or null when the roadmap or today's deploys cannot be read (the report still goes out, and says so). */
async function taskScorecard(day: string): Promise<string | null> {
  const file = path.join(process.cwd(), "ROADMAP.md")
  if (!existsSync(file)) {
    logEvent("warn", "nightly-report", "Daily Task Scorecard: ROADMAP.md is not in the image", { fold: true })
    return "📋 វឌ្ឍនភាពកិច្ចការងារថ្ងៃនេះ៖ មិនអាចអាន ROADMAP.md បានទេ"
  }
  const { data, error } = await botDb().rpc("bot_deployed_hashes", { p_key: botKey(), p_day: day })
  if (error) {
    logEvent("warn", "nightly-report", `Daily Task Scorecard: ${error.message}`, { fold: true })
    return "📋 វឌ្ឍនភាពកិច្ចការងារថ្ងៃនេះ៖ មិនអាចអានការដាក់ឱ្យដំណើរការថ្ងៃនេះបានទេ"
  }
  return scorecardText(dailyScorecard(parseRoadmap(readFileSync(file, "utf8")), (data as string[] | null) ?? []))
}
