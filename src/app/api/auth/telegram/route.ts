import { NextResponse } from "next/server"

import { claimSingleSession } from "@/lib/auth/single-session"
import { logEvent } from "@/lib/server/events"
import { guardRequest, readJson } from "@/lib/server/guard"
import { botDb, botKey, botToken } from "@/lib/server/telegram-bot"
import { botIdFromToken, verifyTelegramLogin } from "@/lib/server/telegram-login"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * «ចូលរហ័សជាមួយ Telegram» (Telegram Login Widget). On only when TELEGRAM_LOGIN=on and the server
 * has SUPABASE_SERVICE_ROLE_KEY (server only, never NEXT_PUBLIC_) — and the bot's domain is set in
 * @BotFather (/setdomain). Signs in an account that already linked this Telegram in the app; never
 * creates one. The session is made on the server (a one-time magic-link token, never sent anywhere)
 * and set as cookies; then the one-device rule applies as for any sign-in.
 */
export const runtime = "nodejs"

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
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

  // A one-time token for this account (no email is sent), redeemed here at once.
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey()!, Authorization: `Bearer ${serviceKey()}` },
    body: JSON.stringify({ type: "magiclink", email: user.email }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  const body = (await link?.json().catch(() => null)) as { hashed_token?: string; properties?: { hashed_token?: string } } | null
  const tokenHash = body?.properties?.hashed_token ?? body?.hashed_token
  if (!link?.ok || !tokenHash) {
    logEvent("error", "auth", `Telegram sign-in: generate_link failed (HTTP ${link?.status ?? "network"})`, { fold: true })
    return NextResponse.json({ error: "busy" }, { status: 503 })
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
  if (error) {
    logEvent("error", "auth", `Telegram sign-in: verify failed (${error.message.slice(0, 80)})`, { fold: true })
    return NextResponse.json({ error: "busy" }, { status: 503 })
  }
  await claimSingleSession(supabase)
  logEvent("info", "auth", "Signed in with Telegram", { fold: true })
  return NextResponse.json({ ok: true })
}
