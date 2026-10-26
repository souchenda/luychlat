// Server only: the owner's-draw card from DL Staff (Task #521) — sent to the founder's private chat when the ERP's draw
// arrives, decided by his tap (public.erp_draw_decide checks it is the business's owner, once).
import { drawCard, drawOutcome, parseDrawCallback, type DrawCardData } from "@/lib/erp-draw-card"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, maskNumbers, sendText, tg } from "@/lib/server/telegram-bot"

export { isErpDrawCallback } from "@/lib/erp-draw-card"

/** The card in the owner's private chat; false (logged) when he has no linked Telegram — the draw then waits. */
export async function sendDrawCard(chatId: number | null | undefined, d: DrawCardData): Promise<boolean> {
  if (!chatId) {
    logEvent("warn", "erp-sync", `Owner's draw ${d.reference} waits: the owner has no linked Telegram`, { fold: true })
    return false
  }
  const card = drawCard(d)
  const sent = await sendText(chatId, maskNumbers(card.text), { reply_markup: card.reply_markup }).catch(() => null)
  const ok = Boolean((sent as { ok?: boolean } | null)?.ok)
  if (!ok) logEvent("warn", "erp-sync", `Owner's draw card ${d.reference} not delivered`, { fold: true })
  return ok
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

export async function handleErpDrawCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const parsed = parseDrawCallback(cb.data)
  const chatId = cb.message?.chat.id
  // His own private chat only — never a group.
  if (!parsed || !chatId || cb.message?.chat.type !== "private") return answer()
  const { data, error } = await botDb().rpc("erp_draw_decide", { p_key: botKey(), p_chat_id: chatId, p_token: parsed.token, p_approve: parsed.approve })
  if (error) {
    const notOwner = /not_owner/.test(error.message)
    if (!notOwner) logEvent("error", "erp-sync", `Owner's draw decision failed: ${error.message}`, { fold: true })
    return answer(notOwner ? "⛔ មានតែម្ចាស់អាជីវកម្មប៉ុណ្ណោះដែលអាចសម្រេចបាន" : "⚠️ មិនអាចកត់ត្រាបានទេ សូមសាកម្ដងទៀត", true)
  }
  const r = data as { status: string; amount?: number; currency?: "USD" | "KHR"; wallet?: string | null; state?: string; reference_id?: string }
  if (r.status === "approved" || r.status === "rejected") logEvent("info", "erp-sync", `Owner's draw ${r.reference_id} ${r.status} by the owner`, { fold: true })
  const line = drawOutcome(r)
  await answer(line)
  // The card keeps its details; the buttons give way to what was decided.
  const details = (cb.message?.text ?? "").split("\n\n")[0] ?? ""
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers([details, line].filter(Boolean).join("\n\n")) }).catch(() => null)
}
