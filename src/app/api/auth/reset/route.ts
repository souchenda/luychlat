import { NextResponse } from "next/server"

import { parseLoginIdentifier } from "@/lib/auth-identifier"
import type { Locale } from "@/lib/i18n/dictionaries"
import { botDb, botKey, tg, tr } from "@/lib/server/telegram-bot"

/**
 * Forgot password, step 1 (no sign-in): a 6-digit code to the Telegram chat
 * linked to the account, and a deep link (t.me/<bot>?start=reset_<token>) for
 * accounts that haven't linked Telegram (phone accounts prove the number by
 * sharing their Telegram contact). The answer is the same whether or not the
 * account exists, and the code itself never leaves the server.
 */
export const runtime = "nodejs"

// A light per-address brake against someone hammering the endpoint.
const hits = new Map<string, number[]>()
const LIMIT = 10
const WINDOW = 15 * 60_000

let botUsername: string | null = null
async function username() {
  if (botUsername) return botUsername
  const me = await tg<{ username?: string }>("getMe", {})
  botUsername = me.result?.username ?? null
  return botUsername
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW)
  if (recent.length >= LIMIT) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  hits.set(ip, [...recent, now])

  let identifier = ""
  try {
    identifier = String(((await request.json()) as { identifier?: unknown }).identifier ?? "")
  } catch {}
  const id = parseLoginIdentifier(identifier.slice(0, 200))
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const key = botKey()
  if (!key) return NextResponse.json({ error: "unavailable" }, { status: 503 })

  const { data, error } = await botDb().rpc("bot_reset_start", { p_key: key, p_email: id.email })
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503 })
  const r = data as { status: string; link_token?: string; chat_id?: number; language?: Locale; code?: string }
  if (r.status === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  if (r.code && r.chat_id) {
    const lang: Locale = r.language === "en" || r.language === "zh" ? r.language : "km"
    await tg("sendMessage", { chat_id: r.chat_id, text: tr(lang, "bot.resetCode", { code: r.code }), parse_mode: "HTML" })
  }
  const bot = await username()
  return NextResponse.json({ ok: true, link: bot && r.link_token ? `https://t.me/${bot}?start=reset_${r.link_token}` : null })
}
