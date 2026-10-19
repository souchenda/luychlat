// Server only: a member's place suggestion reaches the approval room «LCA Approval» at once (founder, 19/10/2026):
// the app calls /api/islamic/places/notify right after the insert, and the dispatcher catches anything missed. Each
// pending place is claimed once in the database, so it is never sent twice. A tap is checked there too
// (bot_place_review → super admin only, audited); an approval thanks the member (bell + Telegram), in their
// community's words (lib/contributor-thanks.ts).
import { approvedThanks, communityBadge, type Contribution } from "@/lib/contributor-thanks"
import { isPlaceReviewCallback, parsePlaceReviewCallback, placeAlertButtons, placeAlertText, placeDecisionLine, type PendingPlace } from "@/lib/place-alerts"
import { marketingChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, sendText, tg } from "@/lib/server/telegram-bot"

export { isPlaceReviewCallback }

let flushing: Promise<void> | null = null

/** Send each new pending place to the approval room, once (one pass at a time; a second caller waits for it). */
export function flushPlaceSubmissions(): Promise<void> {
  if (flushing) return flushing.then(() => flushPlaceSubmissions())
  flushing = (async () => {
    const chats = await marketingChats()
    if (!chats.length) return
    const { data, error } = await botDb().rpc("bot_places_to_notify", { p_key: botKey() })
    if (error || !data?.length) return
    for (const p of data as (PendingPlace & { islamic: boolean })[]) {
      let sent = false
      for (const chat of chats) {
        const res = await tg("sendMessage", { chat_id: chat, text: `${communityBadge(p.islamic)}\n${placeAlertText(p)}`, disable_web_page_preview: true, reply_markup: { inline_keyboard: placeAlertButtons(p) } })
        if (res.ok) sent = true
        else logEvent("error", "places", `Place alert not sent: ${res.description ?? "?"}`, { fold: true })
      }
      // Not delivered anywhere: hand it back for the next pass.
      if (!sent) await botDb().rpc("bot_place_unclaim", { p_key: botKey(), p_id: p.id })
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/** The member's thanks once approved: the bell notice (database) and a Telegram note if they linked it. */
export async function thankContributor(kind: Contribution, id: string) {
  const islamic = approvedThanks(true, kind)
  const general = approvedThanks(false, kind)
  const { data } = await botDb().rpc("bot_contributor_thank", {
    p_key: botKey(),
    p_kind: kind,
    p_id: id,
    p_islamic_title: islamic.title,
    p_islamic_message: islamic.message,
    p_general_title: general.title,
    p_general_message: general.message,
  })
  const r = data as { islamic: boolean; chat_id: number | null } | null
  if (r?.chat_id) await sendText(r.chat_id, (r.islamic ? islamic : general).message)
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
  if (error) {
    // Logged, so a failure is never silent again (19/10/2026: an audit-log check failed the whole approval).
    logEvent("error", "places", `Place review failed (${parsed.id}): ${error.message}`, { fold: true })
    return void (await answer(/super admin only/.test(error.message) ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true))
  }
  const r = data as { status: "approved" | "rejected" | "done" | "missing"; name?: string; province?: string | null }
  // Already approved (e.g. in the app): the card shows it too and loses its buttons, so it can't be decided twice.
  const status = r.status === "approved" || r.status === "done" ? "approved" : r.status === "rejected" ? "rejected" : null
  if (!status) {
    await answer("ទីតាំងនេះត្រូវបានដកចេញរួចហើយ។", true)
    await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
    return
  }
  await answer(r.status === "done" ? "✅ បានអនុម័តរួចហើយ។" : status === "approved" ? "✅ បានអនុម័ត" : "❌ បានបដិសេធ")
  await tg("editMessageText", {
    chat_id: chat.id,
    message_id: cb.message!.message_id,
    text: `${cb.message?.text ?? ""}\n\n${placeDecisionLine(status, r)}`.trim(),
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  })
  if (r.status === "done") return
  if (status === "approved") await thankContributor("place", parsed.id)
  logEvent("info", "places", `Place ${status} from Telegram (${parsed.id})`)
}
