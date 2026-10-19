// Server only: the nightly report before midnight (founder, 19/10/2026) — at 23:30 Cambodia time (or as soon as the
// server is up inside 23:30–23:59), once a day, to «LCA Approval» (else the marketing chat, else the founder's chat):
// the server's health, today's new members and approvals. Counts only.
import { nightlyDue, nightlyReportText } from "@/lib/nightly-report"
import { marketingChats } from "./admin-routes"
import { logEvent } from "./events"
import { diskFreeGb, findIssues, takeSample } from "./health-watchdog"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, tg } from "./telegram-bot"

export async function nightlyReportTick() {
  const now = phnomPenhToday()
  if (!nightlyDue(now.hour, now.minute)) return
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: "nightly-report", p_day: now.day })
  if (claimed !== true) return
  await sendNightlyReport(now.day)
}

/** Builds and sends the card; the number of chats that received it is logged (never a silent «sent»). */
export async function sendNightlyReport(day: string): Promise<number> {
  const sample = await takeSample()
  const { data } = await botDb().rpc("bot_nightly_stats", { p_key: botKey(), p_day: day })
  const stats = (data as { new_users?: number; approvals?: number } | null) ?? {}
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
    dockerOk: sample.db_ms !== null,
    webhookOk: !sample.webhook_error,
  })
  let sent = 0
  for (const chat of await marketingChats()) {
    const res = await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true })
    if (res.ok) sent++
    else logEvent("error", "nightly-report", `Nightly report not delivered: ${res.description ?? "?"}`, { fold: true })
  }
  logEvent(sent ? "info" : "warn", "nightly-report", `Nightly report ${day} sent to ${sent} chat(s)`)
  return sent
}
