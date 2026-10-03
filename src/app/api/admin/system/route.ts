import { NextResponse } from "next/server"

import { isAdminCaller } from "@/lib/server/admin-auth"
import { guardRequest } from "@/lib/server/guard"
import { currentMarket } from "@/lib/server/market-sync"
import { botDb, botKey, botToken, tg } from "@/lib/server/telegram-bot"

/**
 * /admin › System health & bot security. Admins only (the database checks).
 * Adds what only the server knows: process uptime and memory, a timed
 * database ping, Telegram's view of the bot and webhook, and the live feeds.
 */
export const runtime = "nodejs"

const startedAt = new Date()

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-system", limit: 30, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const admin = await isAdminCaller(request)
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  // Database round trip through the server's own path (bot key).
  const pingStart = Date.now()
  const ping = botToken() ? await botDb().rpc("bot_ping", { p_key: botKey() }) : { error: { message: "no bot token" } }
  const dbMs = Date.now() - pingStart

  type Me = { username?: string }
  type Hook = { url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string; max_connections?: number }
  const tgStart = Date.now()
  const [me, hook] = botToken() ? await Promise.all([tg<Me>("getMe", {}), tg<Hook>("getWebhookInfo", {})]) : [null, null]
  const tgMs = Date.now() - tgStart
  const market = await currentMarket()

  return NextResponse.json({
    ...admin.status,
    server: {
      started_at: startedAt.toISOString(),
      uptime_s: Math.round(process.uptime()),
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      dispatcher: process.env.BOT_DISPATCHER === "on",
    },
    database: { ok: !ping.error, ms: dbMs, error: ping.error?.message ?? null },
    telegram: {
      ok: Boolean(me?.ok),
      ms: tgMs,
      username: me?.result?.username ?? null,
      webhook_url: hook?.result?.url ?? null,
      pending: hook?.result?.pending_update_count ?? null,
      last_error_at: hook?.result?.last_error_date ? new Date(hook.result.last_error_date * 1000).toISOString() : null,
      last_error: hook?.result?.last_error_message ?? null,
      community_chat: process.env.TELEGRAM_COMMUNITY_CHAT_ID?.trim() || null,
      voice: Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    },
    feeds: {
      fetched_at: market?.fetched_at ?? null,
      nbc: market?.nbc ? { date: market.nbc.date, usd_khr: market.nbc.usd_khr } : null,
      gold_spot: market?.gold ? { spot: market.gold.gold_spot, updated_at: market.gold.updated_at } : null,
      local_gold: market?.local_gold ?? null,
    },
  })
}
