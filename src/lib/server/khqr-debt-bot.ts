// Server only: a KHQR payment that may repay a customer's debt (AR) — the owner is asked in their private chat, never a
// group; nothing is booked without their ✅ (founder, 4/11/2026 — lib/khqr-debt-match.ts, migration 20270287000000).
import type { Locale } from "@/lib/i18n/dictionaries"
import { matchDebt, type OpenDebt } from "@/lib/khqr-debt-match"
import { formatMoney } from "@/lib/money"
import { botContext, contextLocale } from "@/lib/server/bot-commands"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"

type Candidates = { status: string; workspace_id?: string; amount?: number | string; currency?: "KHR" | "USD"; payer?: string; debts?: OpenDebt[] }
type Settled = { status: string; party?: string; amount?: number | string; currency?: "KHR" | "USD"; paid_off?: boolean }
type KhqrDebtCallback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

/** «kd:<id>:y» / «kd:<id>:n» under the question (well under Telegram's 64 bytes). */
export const isKhqrDebtCallback = (data: string | undefined) => /^kd:\d+:[yn]$/.test(data ?? "")

const langOf = (l?: string | null): Locale => (l === "en" || l === "zh" ? l : "km")

/** After a KHQR sale is recorded: one matching open debt → the question to the owner. Every outcome is logged, none silent. */
export async function offerDebtMatch(transactionId: string): Promise<void> {
  const { data, error } = await botDb().rpc("bot_khqr_debt_candidates", { p_key: botKey(), p_transaction_id: transactionId })
  const c = data as Candidates | null
  if (error || !c || c.status !== "ok" || !c.workspace_id || !c.currency) {
    if (error) logEvent("warn", "khqr", `Debt match not checked: ${error.message}`, { fold: true })
    return
  }
  const amount = Number(c.amount)
  const debt = matchDebt({ amount, payer: c.payer }, (c.debts ?? []).map((d) => ({ ...d, remaining: Number(d.remaining) })))
  if (!debt) return
  const { data: id, error: offerError } = await botDb().rpc("bot_khqr_debt_offer", { p_key: botKey(), p_transaction_id: transactionId, p_debt_id: debt.id })
  if (offerError || !id) {
    if (offerError) logEvent("warn", "khqr", `Debt match not offered: ${offerError.message}`, { fold: true })
    return
  }
  const { data: chats } = await botDb().rpc("bot_biz_owner_chats", { p_key: botKey(), p_workspace_id: c.workspace_id, p_group: null })
  const owners = (chats as { chat_id: number; language?: string | null }[] | null) ?? []
  let reached = 0
  for (const o of owners) {
    const lang = langOf(o.language)
    const res = await sendText(Number(o.chat_id), tr(lang, "bot.debtMatchAsk", { amount: formatMoney(amount, c.currency), payer: c.payer ?? "", party: debt.party_name }), {
      reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.debtMatchYes"), callback_data: `kd:${id}:y` }], [{ text: tr(lang, "bot.debtMatchNo"), callback_data: `kd:${id}:n` }]] },
    })
    if (res.ok) reached += 1
  }
  logEvent(reached ? "info" : "warn", "khqr", `Debt match offered for «${debt.party_name}»: reached ${reached} of ${owners.length} owner chat(s)`, { fold: true })
}

/** ✅ / ❌ under the question: the database checks the owner and the debt again, then the question becomes the outcome. */
export async function handleKhqrDebtCallback(cb: KhqrDebtCallback): Promise<void> {
  const chatId = cb.message?.chat.id
  const [, id, yn] = (cb.data ?? "").split(":")
  if (!chatId || cb.message?.chat.type !== "private") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const { data, error } = await botDb().rpc("bot_khqr_debt_settle", { p_key: botKey(), p_chat_id: chatId, p_id: Number(id), p_accept: yn === "y" })
  const r = data as Settled | null
  const lang = contextLocale(await botContext(chatId))
  const outcome =
    error || !r
      ? tr(lang, "bot.saveFailed")
      : r.status === "settled"
        ? tr(lang, r.paid_off ? "bot.debtMatchPaidOff" : "bot.debtMatchDone", { party: r.party ?? "", amount: formatMoney(Number(r.amount), r.currency ?? "USD") })
        : r.status === "declined"
          ? tr(lang, "bot.debtMatchDeclined")
          : r.status === "already"
            ? tr(lang, "bot.debtMatchAlready")
            : r.status === "stale"
              ? tr(lang, "bot.debtMatchStale")
              : tr(lang, "bot.cmdReadonly")
  if (error) logEvent("warn", "khqr", `Debt match not settled: ${error.message}`, { fold: true })
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: outcome.slice(0, 190) })
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${cb.message?.text ?? ""}\n\n${outcome}`.slice(0, 4000) })
}
