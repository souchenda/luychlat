import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest, readJson } from "@/lib/server/guard"
import { serviceKey, startSession } from "@/lib/server/magic-session"
import { botDb, botKey } from "@/lib/server/telegram-bot"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * The bot's one-tap link (lib/telegram-signup.ts): /login#tgLogin=<token> posts the token here; it is spent once
 * (public.bot_signin_redeem — 15 minutes, single use) and the account is signed in on the server. Needs the service key.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "auth-telegram-link", limit: 10, windowMs: 60_000, maxBytes: 500 })
  if (blocked) return blocked
  if (!serviceKey() || !supabaseUrl || !botKey()) return NextResponse.json({ error: "off" }, { status: 503 })

  const token = String(((await readJson(request, 500)) as { token?: unknown } | null)?.token ?? "")
  const { data, error } = await botDb().rpc("bot_signin_redeem", { p_key: botKey(), p_token: token })
  const r = data as { status?: string; email?: string } | null
  if (error) return NextResponse.json({ error: "busy" }, { status: 503 })
  if (r?.status !== "ok" || !r.email) {
    logEvent("info", "auth", "Bot sign-in link: expired, used or unknown", { fold: true })
    return NextResponse.json({ error: "expired" }, { status: 410 })
  }
  if (!(await startSession(r.email, "Bot sign-in link"))) return NextResponse.json({ error: "busy" }, { status: 503 })
  logEvent("info", "auth", "Signed in with the bot's link", { fold: true })
  return NextResponse.json({ ok: true })
}
