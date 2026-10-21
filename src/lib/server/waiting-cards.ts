// Server only: the approval cards still waiting in «LCA Approval», by message number — so the nightly and end-of-day
// reports never ask the founder to tap a card already decided (founder, 22/10/2026 — Task #452; report-standard ›
// checkActions). Null when they cannot be read: the reports then ask every step, nothing hidden.
import type { WaitingCard } from "@/lib/report-standard"

import { logEvent } from "./events"
import { botDb, botKey } from "./telegram-bot"

export async function waitingCards(source: string): Promise<WaitingCard[] | null> {
  const { data, error } = await botDb().rpc("bot_posts_waiting", { p_key: botKey() })
  if (error) {
    logEvent("warn", source, `Approval cards not read (every roadmap step is asked): ${error.message}`, { fold: true })
    return null
  }
  const rows = (data as { status: string; publish_at: string; previews?: { msg: number }[] | null }[] | null) ?? []
  return rows.flatMap((r) =>
    r.status === "PENDING" || r.status === "APPROVED" ? (r.previews ?? []).map((p) => ({ msg: Number(p.msg), status: r.status as WaitingCard["status"], publishAt: r.publish_at })) : [],
  )
}
