import type { TelegramSettings } from "@/lib/data/types"

type ProxyResult = { ok: boolean; error?: string; chats?: { id: string; name: string }[] }

async function callProxy(payload: Record<string, unknown>): Promise<ProxyResult> {
  const res = await fetch("/api/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return (await res.json()) as ProxyResult
}

/** Sends an HTML-formatted message to the configured chat; returns Telegram's error text on failure. */
export async function sendTelegram(settings: Pick<TelegramSettings, "bot_token" | "chat_id">, text: string) {
  return callProxy({ action: "send", botToken: settings.bot_token, chatId: settings.chat_id, text })
}

/** Chats that recently pressed Start / messaged the bot, to pick the Chat ID without copy-pasting. */
export async function findTelegramChats(botToken: string) {
  return callProxy({ action: "findChats", botToken })
}

export const BOT_TOKEN_PATTERN = /^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$/
export const CHAT_ID_PATTERN = /^(-?[0-9]{3,20}|@[A-Za-z0-9_]{5,32})$/
