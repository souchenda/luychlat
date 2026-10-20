// Server only: the nightly report before midnight (founder, 19/10/2026) — at 23:30 Cambodia time (or as soon as the
// server is up inside 23:30–23:59), once a day, to «LCA Approval» (else the marketing chat, else the founder's chat):
// the server's health, today's new members and approvals. Counts only.
import { MORNING_BRIEFING, morningBriefingText, nightlyReportDay, nightlyReportText } from "@/lib/nightly-report"
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
  const stats = (data as { new_users?: number; approvals?: number; by_approver?: { name?: string | null; count?: number }[]; auto_published?: number } | null) ?? {}
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
    autoPublished: Number(stats.auto_published ?? 0),
    dockerOk: sample.db_ms !== null,
    webhookOk: !sample.webhook_error,
  })
  let sent = 0
  // The founder's private chat only — never «LCA Approval» (an approval queue, founder 20/10/2026).
  for (const chat of await founderChats()) {
    const res = await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true })
    if (res.ok) sent++
    else logEvent("error", "nightly-report", `Nightly report not delivered: ${res.description ?? "?"}`, { fold: true })
  }
  logEvent(sent ? "info" : "warn", "nightly-report", `Nightly report ${day} sent to ${sent} chat(s)`)
  return sent
}
