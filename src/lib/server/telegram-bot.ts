// Server only (node:crypto and the bot token): never import from a client component.
import { createHmac } from "crypto"

import { createClient } from "@supabase/supabase-js"

import { dictionaries, type Locale, type MessageKey } from "@/lib/i18n/dictionaries"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * The official LuyChlat Telegram bot, server side. TELEGRAM_BOT_TOKEN lives
 * only in the server environment. Two values are derived from it:
 *   - the bot key, sent to the database's bot_* functions (the database keeps
 *     only its SHA-256, set by an admin with "Activate bot");
 *   - the webhook secret Telegram sends back on every update.
 * The server needs no master database key.
 */

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null

const derive = (label: string) => {
  const token = botToken()
  return token ? createHmac("sha256", token).update(label).digest("hex") : null
}
export const botKey = () => derive("luychlat-bot-rpc")
export const webhookSecret = () => derive("luychlat-webhook")

/** Telegram Bot API call; never logs the token. */
export async function tg<T = unknown>(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = botToken()
  if (!token) return { ok: false, description: "no token" }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
    return (await res.json()) as { ok: boolean; result?: T; description?: string }
  } catch {
    return { ok: false, description: "network" }
  }
}

/** Dates written with dashes (05-10-2026, 2026-10-05) look like 8-digit numbers. */
const DATE_LIKE = /(?<![\d-])(\d{1,2}-\d{1,2}-\d{4}|\d{4}-\d{2}-\d{2})(?![\d-])/g

/**
 * Account, card and phone numbers in a chat message: 8+ digits (spaces or
 * dashes between groups allowed) → "•••• 4222". Amounts are formatted with
 * commas; dates (with slashes, or dd-mm-yyyy / yyyy-mm-dd) are set aside
 * first, so they're never masked.
 */
export const maskNumbers = (text: string) => {
  const dates: string[] = []
  return text
    .replace(DATE_LIKE, (d) => `\u0000${dates.push(d) - 1}\u0000`)
    .replace(/(?<![\d,.])\d(?:[ -]?\d){7,}(?![\d,.])/g, (run) => `•••• ${run.replace(/\D/g, "").slice(-4)}`)
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => dates[Number(i)])
}

/**
 * Plain-text message (no HTML parsing, so nothing in a name can change the
 * markup). Private chats get account-like numbers masked (maskNumbers).
 */
export function sendText(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  const body = typeof chatId === "number" && chatId > 0 ? maskNumbers(text) : text
  return tg("sendMessage", { chat_id: chatId, text: body.slice(0, 4000), disable_web_page_preview: true, ...extra })
}

/** Stored alert texts escape &, <, > for HTML; turn them back for plain text. */
export const unescapeHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

/** Database client without a user session: only the bot_* functions (with the key) work. */
export function botDb() {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function tr(locale: Locale, key: MessageKey, params?: Record<string, string | number>) {
  let text: string = dictionaries[locale][key]
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

export const SIGNATURE = "\n\n— លុយឆ្លាត · LuyChlat"

/**
 * The bytes of a file the bot received (e.g. a receipt photo in a pool group).
 * Fetched from Telegram on demand; the bot token never leaves the server.
 */
export async function telegramFile(fileId: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const token = botToken()
  if (!token || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return null
  const info = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId })
  const path = info.result?.file_path
  if (!info.ok || !path || (info.result?.file_size ?? 0) > 10 * 1024 * 1024) return null
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const type = /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg"
    return { bytes: await res.arrayBuffer(), type }
  } catch {
    return null
  }
}
