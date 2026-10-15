import { createHash } from "crypto"

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import BOT_COMMANDS from "@/lib/bot-commands.json"
import { guardRequest } from "@/lib/server/guard"
import { botKey, botToken, tg, webhookSecret } from "@/lib/server/telegram-bot"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"
import { cleanFetch } from "@/lib/supabase/clean-fetch"

/**
 * /admin › "Activate bot": checks TELEGRAM_BOT_TOKEN with Telegram, stores the
 * bot key's hash (as the signed-in admin — the database refuses anyone else),
 * points Telegram's webhook at this site and sets the command menu.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "telegram-activate", limit: 5, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  if (!botToken()) return NextResponse.json({ error: "no_token" }, { status: 503 })

  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const me = await tg<{ username: string }>("getMe", {})
  if (!me.ok || !me.result?.username) return NextResponse.json({ error: "bad_token" }, { status: 502 })

  // As the admin: admin_set_bot checks is_admin() itself.
  const db = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth }, fetch: cleanFetch },
  })
  const hash = createHash("sha256").update(botKey()!).digest("hex")
  const { error } = await db.rpc("admin_set_bot", { p_key_hash: hash, p_username: me.result.username })
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const url = `https://${host}/api/telegram/webhook`
  const hook = await tg("setWebhook", {
    url,
    secret_token: webhookSecret(),
    // my_chat_member: added to / removed from groups (unlinked groups are left after 10 minutes).
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  })
  await tg("setMyCommands", { commands: BOT_COMMANDS })
  return NextResponse.json({ username: me.result.username, webhook: hook.ok ? url : null, webhookError: hook.ok ? null : hook.description })
}
