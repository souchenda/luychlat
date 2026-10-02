import { timingSafeEqual } from "crypto"

import { NextResponse } from "next/server"

import type { Locale } from "@/lib/i18n/dictionaries"
import { botDb, botKey, sendText, SIGNATURE, tr, webhookSecret } from "@/lib/server/telegram-bot"

/**
 * Updates from Telegram for the official bot. Telegram sends the secret we
 * registered with setWebhook in a header; anything else is rejected.
 *   /start <code>  link this chat to the LuyChlat account that made the code
 *   /start, /help  how to connect
 *   /stop          unlink
 * Only private chats are handled. Always answers 200 so Telegram doesn't retry.
 */
export const runtime = "nodejs"

type Update = {
  message?: {
    text?: string
    chat: { id: number; type: string }
    from?: { username?: string; language_code?: string }
  }
}

function sameSecret(a: string | null, b: string | null) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret())) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  let update: Update
  try {
    update = (await request.json()) as Update
  } catch {
    return NextResponse.json({ ok: true })
  }
  const message = update.message
  if (!message?.text || message.chat.type !== "private") return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  // Replies are in Khmer (the bot's audience); reminders use each user's chosen language.
  const lang: Locale = "km"
  const [command, payload] = message.text.trim().split(/\s+/, 2)
  const key = botKey()!
  const db = botDb()

  if (command === "/start" && payload && /^[0-9a-fA-F]{32}$/.test(payload)) {
    const { data, error } = await db.rpc("bot_link_chat", {
      p_key: key,
      p_code: payload,
      p_chat_id: chatId,
      p_username: message.from?.username ?? null,
      p_language: message.from?.language_code?.startsWith("en") ? "en" : "km",
    })
    const result = data as { ok: boolean; name?: string } | null
    if (error || !result?.ok) await sendText(chatId, tr(lang, "bot.linkFailed") + SIGNATURE)
    else await sendText(chatId, tr(lang, "bot.linked", { name: result.name || "" }) + SIGNATURE)
  } else if (command === "/stop") {
    const { data } = await db.rpc("bot_unlink_chat", { p_key: key, p_chat_id: chatId })
    await sendText(chatId, tr(lang, data ? "bot.unlinked" : "bot.notLinked") + SIGNATURE)
  } else {
    await sendText(chatId, tr(lang, "bot.help") + SIGNATURE)
  }
  return NextResponse.json({ ok: true })
}
