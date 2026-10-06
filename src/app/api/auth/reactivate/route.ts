import { NextResponse } from "next/server"

import type { Locale } from "@/lib/i18n/dictionaries"
import { botDb, botKey, tg, tr } from "@/lib/server/telegram-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * A dormant account (6+ months inactive) wakes up with a code sent to its
 * linked Telegram chat — the same hashed, 10-minute, 5-try code as a password
 * reset (bot_reset_start); the app verifies it and calls reactivate_dormant.
 * Signed-in only: the account is the one asking.
 */
export const runtime = "nodejs"

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const email = auth.user?.email
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const key = botKey()
  if (!key) return NextResponse.json({ error: "unavailable" }, { status: 503 })

  const { data, error } = await botDb().rpc("bot_reset_start", { p_key: key, p_email: email })
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503 })
  const r = data as { status: string; chat_id?: number; language?: Locale; code?: string }
  if (r.status === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  if (!r.code || !r.chat_id) return NextResponse.json({ sent: false })
  const lang: Locale = r.language === "en" || r.language === "zh" ? r.language : "km"
  const sent = await tg("sendMessage", { chat_id: r.chat_id, text: tr(lang, "bot.reactivateCode", { code: r.code }), parse_mode: "HTML" })
  return NextResponse.json({ sent: Boolean(sent.ok) })
}
