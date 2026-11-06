// Server only: «this job, once a day» (public.bot_claim_daily), remembered in this process (founder, 6/11/2026 — the
// Supabase Disk IO warning on the Free plan). The scheduler asks every minute whether a daily job may run: after 07:00
// the birthday job, after 09:00 the reaction audit, the Islamic places seed on every minute of every day … each a write
// (an insert that conflicts and a clean-up delete). Once the database has answered for a job and a day — «yours» or
// «already done» — the answer stands for that day, so it is asked once, not 1,000 times. A job that can be released and
// retried (the festival posters' bot_release_daily) keeps calling the database itself.
import { botDb, botKey } from "@/lib/server/telegram-bot"

const answered = new Map<string, boolean>()

export async function claimDaily(job: string, day: string): Promise<{ data: boolean | null }> {
  const key = `${job}|${day}`
  if (answered.has(key)) return { data: false }
  const { data, error } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  if (error || typeof data !== "boolean") return { data: null }
  answered.set(key, data)
  // Yesterday's answers are never asked again: keep the map small.
  if (answered.size > 500) for (const k of [...answered.keys()].slice(0, 250)) answered.delete(k)
  return { data }
}
