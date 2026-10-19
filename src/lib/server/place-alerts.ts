// Server only: a member's place suggestion reaches the approval room «LCA Approval» at once (founder, 19/10/2026):
// the app calls /api/islamic/places/notify right after the insert, and the dispatcher catches anything missed. Each
// pending place is claimed once in the database, so it is never sent twice. A tap is checked there too
// (bot_place_review → super admin only, audited); an approval thanks the member (bell + Telegram), in their
// community's words (lib/contributor-thanks.ts).
import { approvedThanks, communityBadge, decidedCard, placeThanks, thanksToast as thankToast, type Contribution, type ThanksStatus } from "@/lib/contributor-thanks"
import { isPlaceReviewCallback, parsePlaceReviewCallback, placeAlertButtons, placeAlertText, placeDecisionLine, type PendingPlace } from "@/lib/place-alerts"
import { marketingChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"

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

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
type Tg = (method: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; description?: string }>
export type ReviewDeps = { rpc: Rpc; tg: Tg; log: (level: "info" | "warn" | "error", message: string) => void }
const realDeps = (): ReviewDeps => ({
  rpc: async (fn, args) => {
    const { data, error } = await botDb().rpc(fn, { p_key: botKey(), ...args })
    return { data, error: error ? { message: error.message } : null }
  },
  tg: (method, payload) => tg(method, payload),
  log: (level, message) => logEvent(level, "places", message, { fold: level !== "info" }),
})

/**
 * The member's thanks once approved: the bell notice (database) and a private Telegram message from @luychlat_bot if
 * their account is linked — in their community's words (a place: the founder's message naming it). Never breaks the
 * approval: a missing link or a blocked bot is only logged.
 */
export async function thankContributor(kind: Contribution, id: string, placeName?: string, deps: ReviewDeps = realDeps()): Promise<ThanksStatus> {
  const islamic = kind === "place" && placeName !== undefined ? placeThanks(true, placeName) : null
  const general = kind === "place" && placeName !== undefined ? placeThanks(false, placeName) : null
  const fallbackI = approvedThanks(true, kind)
  const fallbackG = approvedThanks(false, kind)
  const { data, error } = await deps.rpc("bot_contributor_thank", {
    p_kind: kind,
    p_id: id,
    p_islamic_title: islamic?.title ?? fallbackI.title,
    p_islamic_message: islamic?.plain ?? fallbackI.message,
    p_general_title: general?.title ?? fallbackG.title,
    p_general_message: general?.plain ?? fallbackG.message,
  })
  if (error) {
    deps.log("error", `Thanks for ${kind} ${id} not recorded: ${error.message}`)
    return "failed"
  }
  const r = data as { islamic: boolean; chat_id: number | null } | null
  if (!r) return "no_submitter"
  if (!r.chat_id) {
    deps.log("info", `Thanks for ${kind} ${id}: the member has no linked Telegram — in-app notice only`)
    return "no_telegram"
  }
  const html = islamic && general ? (r.islamic ? islamic.html : general.html) : null
  const res = html
    ? await deps.tg("sendMessage", { chat_id: r.chat_id, text: html, parse_mode: "HTML", disable_web_page_preview: true })
    : await deps.tg("sendMessage", { chat_id: r.chat_id, text: (r.islamic ? fallbackI : fallbackG).message, disable_web_page_preview: true })
  if (res.ok) return "sent"
  deps.log("warn", `Thanks for ${kind} ${id} not delivered on Telegram: ${res.description ?? "?"}`)
  return "failed"
}

type Callback = {
  id: string
  data?: string
  from?: { id: number; first_name?: string; last_name?: string; username?: string }
  message?: { message_id: number; text?: string; chat: { id: number; type: string } }
}

/**
 * [ ✅ អនុម័ត ] / [ ❌ បដិសេធ ] — a super admin's or a co-approver's tap (TELEGRAM_APPROVER_IDS, /addapprover; checked in
 * the database). Approve → the submitter's thanks → the toast «✅ បានអនុម័ត និងផ្ញើសារអរគុណរួចរាល់!» → the card shows
 * who approved and whether the thanks went out, without its buttons.
 */
export async function handlePlaceReviewCallback(cb: Callback, deps: ReviewDeps = realDeps()) {
  const answer = (text: string, alert = false) => deps.tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert })
  const parsed = parsePlaceReviewCallback(cb.data)
  const chat = cb.message?.chat
  const actor = chat?.type === "private" ? chat.id : cb.from?.id
  if (!parsed || !chat || !actor) return void (await answer(""))
  const { data, error } = await deps.rpc("bot_place_review", { p_id: parsed.id, p_approve: parsed.approve, p_actor: actor })
  if (error) {
    // Logged, so a failure is never silent again (19/10/2026: an audit-log check failed the whole approval).
    deps.log("error", `Place review failed (${parsed.id}): ${error.message}`)
    return void (await answer(/super admin only/.test(error.message) ? "សម្រាប់អ្នកអនុម័តប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true))
  }
  const r = data as { status: "approved" | "rejected" | "done" | "missing"; name?: string; province?: string | null }
  if (r.status === "missing") {
    await answer("ទីតាំងនេះត្រូវបានដកចេញរួចហើយ។", true)
    await deps.tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
    return
  }
  const approved = r.status !== "rejected"
  // Only a fresh approval thanks the member (an already-approved place was thanked, or approved elsewhere).
  const thanks = r.status === "approved" ? await thankContributor("place", parsed.id, r.name ?? "", deps) : null
  await answer(r.status === "done" ? "✅ បានអនុម័តរួចហើយ។" : !approved ? "❌ បានបដិសេធ" : thankToast(thanks ?? "no_submitter"))
  const by = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || cb.from?.username || String(actor)
  const edit = await deps.tg("editMessageText", {
    chat_id: chat.id,
    message_id: cb.message!.message_id,
    text: decidedCard({ approved, by, thanks, original: cb.message?.text ?? "", footer: placeDecisionLine(approved ? "approved" : "rejected", r) }),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  })
  if (!edit.ok) await deps.tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
  deps.log("info", `Place ${r.status} from Telegram by ${by} (${parsed.id})${thanks ? ` · thanks: ${thanks}` : ""}`)
}

/** Every dispatcher pass: thank the members whose suggestions were approved other than by a tap (once each). */
export async function flushPlaceThanks(deps: ReviewDeps = realDeps()) {
  const { data, error } = await deps.rpc("bot_places_to_thank", {})
  if (error || !Array.isArray(data)) return
  for (const p of data as { id: string; name: string }[]) {
    const status = await thankContributor("place", p.id, p.name, deps)
    deps.log("info", `Thanks for approved place ${p.id}: ${status}`)
  }
}
