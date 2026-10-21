// Server only: an update to a published post edits THAT message — silently — never a delete and a new post (founder,
// 21/10/2026 — Task #441: tonight's replaced morning posts reached the channels at night as new messages, one after
// another). The post's own publisher runs inside `editingMessage`: its channel send becomes an edit of the existing
// message (sendMessage → editMessageText in `tg`, the poster → editMessageMedia in tip-bot's `photo`), and its Page post
// an edit of the existing post's text (facebook-publisher › postToPage). Inside it nothing new can reach that channel or
// the Page: a send that cannot be an edit is refused.
import { AsyncLocalStorage } from "node:async_hooks"

export type EditTarget = {
  /** The channel and its published message. */
  chat: number | string
  messageId: number
  /** The Page post to edit, if the post went there. */
  facebookPostId: string | null
  /** What was edited (filled in as it happens). */
  edited: { telegram: boolean; facebook: boolean }
}

const target = new AsyncLocalStorage<EditTarget>()

export function editingMessage<T>(t: Omit<EditTarget, "edited">, fn: () => Promise<T>): Promise<{ result: T; edited: EditTarget["edited"] }> {
  const store: EditTarget = { ...t, edited: { telegram: false, facebook: false } }
  return target.run(store, async () => ({ result: await fn(), edited: store.edited }))
}

/** The message being edited, when this call is part of an update. */
export const editTarget = () => target.getStore() ?? null

/** Is this send to the channel whose message is being edited? */
export const editsChat = (chatId: unknown) => {
  const t = target.getStore()
  return Boolean(t && String(chatId) === String(t.chat))
}

/** A Bot API send to the channel, rewritten as an edit of its message — or null when it cannot be one (refused). */
export function asEdit(method: string, payload: Record<string, unknown>): { method: string; payload: Record<string, unknown> } | null {
  const t = target.getStore()
  if (!t) return { method, payload }
  if (!method.startsWith("send") || !editsChat(payload.chat_id)) return { method, payload }
  if (method !== "sendMessage") return null
  const { text, parse_mode, disable_web_page_preview, reply_markup } = payload
  return {
    method: "editMessageText",
    payload: { chat_id: t.chat, message_id: t.messageId, text, ...(parse_mode ? { parse_mode } : {}), ...(disable_web_page_preview ? { disable_web_page_preview } : {}), ...(reply_markup ? { reply_markup } : {}) },
  }
}
