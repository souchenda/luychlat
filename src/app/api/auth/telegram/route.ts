import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest, readJson } from "@/lib/server/guard"
import { serviceKey, startSession } from "@/lib/server/magic-session"
import { botDb, botKey, botToken } from "@/lib/server/telegram-bot"
import { botIdFromToken, verifyTelegramLogin } from "@/lib/server/telegram-login"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * «ចូលរហ័សជាមួយ Telegram» (Telegram Login Widget). On only when TELEGRAM_LOGIN=on and the server
 * has SUPABASE_SERVICE_ROLE_KEY (server only, never NEXT_PUBLIC_) — and the bot's domain is set in
 * @BotFather (/setdomain). Signs in an account that already linked this Telegram in the app; never
 * creates one (the bot's «share my number» does — lib/telegram-signup.ts). The session is made on the
 * server (lib/server/magic-session.ts); then the one-device rule applies as for any sign-in.
 */
export const runtime = "nodejs"

const enabled = () => process.env.TELEGRAM_LOGIN === "on" && Boolean(serviceKey() && botToken() && supabaseUrl)

/** Whether the button is shown, and the bot id the widget needs (public). */
export async function GET() {
  return NextResponse.json(enabled() ? { enabled: true, botId: botIdFromToken(botToken() ?? undefined) } : { enabled: false })
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "auth-telegram", limit: 8, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  if (!enabled()) return NextResponse.json({ error: "off" }, { status: 503 })

  const tgId = verifyTelegramLogin(await readJson(request, 2_000), botToken()!)
  if (!tgId) {
    logEvent("warn", "auth", "Telegram sign-in: signature or age check failed", { fold: true })
    return NextResponse.json({ error: "invalid" }, { status: 401 })
  }

  const { data } = await botDb().rpc("bot_login_user", { p_key: botKey(), p_tg_id: tgId })
  const user = data as { status: string; email?: string } | null
  if (user?.status !== "ok" || !user.email) {
    logEvent("info", "auth", "Telegram sign-in: this Telegram isn't linked to an account", { fold: true })
    return NextResponse.json({ error: "not_linked" }, { status: 404 })
  }
  if (!(await startSession(user.email, "Telegram sign-in"))) return NextResponse.json({ error: "busy" }, { status: 503 })
  logEvent("info", "auth", "Signed in with Telegram", { fold: true })
  return NextResponse.json({ ok: true })
}
