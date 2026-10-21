// Server only (node:crypto and the bot token): never import from a client component.
import { createHmac } from "crypto"
import { asEdit, editTarget } from "@/lib/server/edit-in-place"
import { outgoingPayload } from "@/lib/server/numerals"

import { createClient } from "@supabase/supabase-js"

import { dictionaries, type Locale, type MessageKey } from "@/lib/i18n/dictionaries"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { threadFor } from "@/lib/chat-route"

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
  // A message to the marketing / DevOps chat lands in its forum topic, when one is set (lib/chat-route.ts).
  if (method.startsWith("send") && payload.chat_id != null && payload.message_thread_id == null) {
    const thread = threadFor(payload.chat_id)
    if (thread) payload = { ...payload, message_thread_id: thread }
  }
  // 0-9 in everything the bot says (founder, 21/10/2026 — Task #440; lib/numerals.ts), but a royal or national day's.
  payload = outgoingPayload(payload)
  // An update to a published post edits its message — never a new one in the channel (Task #441, edit-in-place.ts).
  const edit = asEdit(method, payload)
  if (!edit) return { ok: false, description: "edit in place: a new message to the channel was refused" }
  const editing = edit.method !== method
  ;({ method, payload } = edit)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    })
    const body = (await res.json()) as { ok: boolean; result?: T; description?: string }
    // «message is not modified»: the channel already shows this version — the edit is done.
    if (editing && (body.ok || /message is not modified/.test(body.description ?? ""))) {
      editTarget()!.edited.telegram = true
      return { ok: true, result: (body.result ?? { message_id: editTarget()!.messageId }) as T }
    }
    if (!body.ok) reportFailure(method, body.description)
    return body
  } catch {
    reportFailure(method, "network")
    return { ok: false, description: "network" }
  }
}

/**
 * A message that didn't reach the chat is never silent: the method and Telegram's reason go to the
 * admin log (never the message itself). Blocked / deleted chats are normal and not reported.
 */
function reportFailure(method: string, description: string | undefined) {
  if (!/^send|^edit/.test(method) || /blocked|chat not found|deactivated|message is not modified/i.test(description ?? "")) return
  void import("./events").then(({ logEvent }) => logEvent("error", "telegram", `Telegram ${method} failed: ${(description ?? "unknown").slice(0, 160)}`, { fold: true })).catch(() => null)
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
    // A wallet name masked for the app ("ACLEDA 078***4222") still shows the prefix: in chat, the last 4 only.
    .replace(/(?<![\d,.])\d{2,3}[*•]{2,}(\d{2,4})(?![\d,.])/g, (_, last: string) => `•••• ${last}`)
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => dates[Number(i)])
}

/**
 * Plain-text message (no HTML parsing, so nothing in a name can change the
 * markup). Private chats get account-like numbers masked (maskNumbers), and a
 * message without buttons of its own also takes any reply keyboard off the
 * screen — clearing the old persistent keyboard for everyone the bot writes to.
 */
export function sendText(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  const priv = typeof chatId === "number" && chatId > 0
  const body = priv ? maskNumbers(text) : text
  const markup = priv && !("reply_markup" in extra) ? { reply_markup: { remove_keyboard: true } } : {}
  return tg("sendMessage", { chat_id: chatId, text: body.slice(0, 4000), disable_web_page_preview: true, ...markup, ...extra })
}

/** Stored alert texts escape &, <, > for HTML; turn them back for plain text. */
export const unescapeHtml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

/** Database client without a user session: only the bot_* functions (with the key) work. */
export function botDb() {
  return createClient(supabaseUrl, supabaseAnonKey, withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))
}

export function tr(locale: Locale, key: MessageKey, params?: Record<string, string | number>) {
  let text: string = dictionaries[locale][key]
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

export const SIGNATURE = "\n\n— អេប លុយឆ្លាត"

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
