// Server only: a member's place suggestion reaches the approval room «LCA Approval» within a minute (founder,
// 19/10/2026), with [ ✅ អនុម័ត ] [ ❌ បដិសេធ ] and a Google Maps link. The dispatcher sends the pending ones not
// sent yet; a tap is checked in the database (bot_place_review → super admin only, audited).
import { isPlaceReviewCallback, parsePlaceReviewCallback, placeAlertButtons, placeAlertText, placeDecisionLine, type PendingPlace } from "@/lib/place-alerts"
import { marketingChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"

export { isPlaceReviewCallback }

/** Every dispatcher pass: each new pending place to the approval room, once. */
export async function flushPlaceSubmissions() {
  const { data, error } = await botDb().rpc("bot_places_to_notify", { p_key: botKey() })
  if (error || !data?.length) return
  const chats = await marketingChats()
  if (!chats.length) return
  for (const p of data as PendingPlace[]) {
    let sent = false
    for (const chat of chats) {
      const res = await tg("sendMessage", { chat_id: chat, text: placeAlertText(p), disable_web_page_preview: true, reply_markup: { inline_keyboard: placeAlertButtons(p) } })
      if (res.ok) sent = true
      else logEvent("error", "places", `Place alert not sent: ${res.description ?? "?"}`, { fold: true })
    }
    if (sent) await botDb().rpc("bot_place_mark_notified", { p_key: botKey(), p_id: p.id })
  }
}

type Callback = { id: string; data?: string; from?: { id: number }; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

/** [ ✅ អនុម័ត ] / [ ❌ បដិសេធ ] — only a super admin's tap counts (their private chat, or the approval group). */
export async function handlePlaceReviewCallback(cb: Callback) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert })
  const parsed = parsePlaceReviewCallback(cb.data)
  const chat = cb.message?.chat
  const actor = chat?.type === "private" ? chat.id : cb.from?.id
  if (!parsed || !chat || !actor) return void (await answer(""))
  const { data, error } = await botDb().rpc("bot_place_review", { p_key: botKey(), p_id: parsed.id, p_approve: parsed.approve, p_actor: actor })
  if (error) return void (await answer(/super admin only/.test(error.message) ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true))
  const r = data as { status: "approved" | "rejected" | "done" | "missing" }
  const status = r.status === "approved" || r.status === "rejected" ? r.status : null
  if (!status) {
    await answer(r.status === "done" ? "✅ បានអនុម័តរួចហើយ។" : "ទីតាំងនេះត្រូវបានដកចេញរួចហើយ។", true)
    await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
    return
  }
  await answer(status === "approved" ? "✅ បានអនុម័ត" : "❌ បានបដិសេធ")
  await tg("editMessageText", {
    chat_id: chat.id,
    message_id: cb.message!.message_id,
    text: `${cb.message?.text ?? ""}\n\n${placeDecisionLine(status)}`.trim(),
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  })
  logEvent("info", "places", `Place ${status} from Telegram (${parsed.id})`)
}
