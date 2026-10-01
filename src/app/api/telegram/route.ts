import { NextResponse } from "next/server"
import { z } from "zod"

/**
 * Thin proxy to the Telegram Bot API for the browser (Telegram doesn't allow
 * calls from web pages). The user's own bot token is passed per request and
 * never stored or logged here. Scheduled cloud alerts don't use this route:
 * public.run_debt_alerts() calls Telegram directly from the database.
 */
export const runtime = "edge"

const BOT_TOKEN = /^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$/
const CHAT_ID = /^(-?[0-9]{3,20}|@[A-Za-z0-9_]{5,32})$/

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    botToken: z.string().regex(BOT_TOKEN),
    chatId: z.string().regex(CHAT_ID),
    text: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("findChats"),
    botToken: z.string().regex(BOT_TOKEN),
  }),
])

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string }
type Update = { message?: { chat: { id: number; type: string; first_name?: string; title?: string; username?: string } } }

async function callTelegram<T>(token: string, method: string, payload: unknown): Promise<TelegramResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
  return (await res.json()) as TelegramResponse<T>
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 })
  const input = parsed.data

  try {
    if (input.action === "send") {
      const res = await callTelegram(input.botToken, "sendMessage", {
        chat_id: input.chatId,
        text: input.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      })
      return res.ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, error: res.description ?? "telegram_error" }, { status: 502 })
    }

    // Chats that recently messaged the bot (the user must press Start first).
    const res = await callTelegram<Update[]>(input.botToken, "getUpdates", { limit: 50, allowed_updates: ["message"] })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.description ?? "telegram_error" }, { status: 502 })
    const chats = new Map<string, string>()
    for (const update of res.result ?? []) {
      const chat = update.message?.chat
      if (chat) chats.set(String(chat.id), chat.title ?? chat.first_name ?? chat.username ?? chat.type)
    }
    return NextResponse.json({ ok: true, chats: [...chats].map(([id, name]) => ({ id, name })) })
  } catch {
    return NextResponse.json({ ok: false, error: "network_error" }, { status: 504 })
  }
}
