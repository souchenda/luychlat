// Server only: receipts and «clc paid» meet the loans (founder, 13/10/2026).
//   offerDebtLink      a slip just saved whose payee is a loan the person owes (CAMBODIAN LABOR CARE PLC →
//                      the CLC loan): «record it as that loan's repayment?» — ✅ makes it the repayment
//                      (category «សងបំណុល», the loan's balance and its LOAN bill updated), ❌ leaves it.
//   proposePaidDebt    «clc paid» / «បង់ clc» typed without an amount: the loan's monthly installment,
//                      offered as a repayment card to confirm — never saved without the ✅.
// Pure part: src/lib/bot/debt-match.ts.
import { debtLinkButtons, isPaidMessage, matchPayableDebt, parseDebtLinkCallback } from "@/lib/bot/debt-match"
import type { BotDebt } from "@/lib/bot/parse-entry"
import { formatMoney } from "@/lib/money"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, sendText, tg } from "@/lib/server/telegram-bot"

/** After a slip is saved: ask whether it repays the loan its payee names (once, only when one loan fits). */
export async function offerDebtLink(chatId: number, txId: string | null | undefined, party: string | null | undefined, debts: BotDebt[]) {
  if (!txId || !party) return
  const debt = matchPayableDebt(party, debts)
  if (!debt) return
  await sendText(chatId, [`🏦 ការបង់នេះទៅ ${party} ត្រូវនឹងកម្ចី «${debt.party_name}»។`, "កត់ជាការសងកម្ចី ហើយកាត់សមតុល្យកម្ចីនេះ?"].join("\n"), {
    reply_markup: debtLinkButtons(txId, debt.id),
  })
}

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }

/** ✅ / ❌ under the question. */
export async function handleDebtLinkCallback(cb: Callback) {
  const answer = (text = "", alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text, show_alert: alert } : {}) })
  const parsed = parseDebtLinkCallback(cb.data)
  const chat = cb.message?.chat
  if (!parsed || !chat || chat.type !== "private") return answer()
  await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
  if (!parsed.debtPrefix) return answer("❌ មិនបានប្ដូរទេ — នៅជាចំណាយធម្មតា")
  const { data, error } = await botDb().rpc("bot_debt_link_payment", { p_key: botKey(), p_chat_id: chat.id, p_tx_id: parsed.txId, p_debt_prefix: parsed.debtPrefix })
  if (error) {
    logEvent("error", "debts", `Debt link failed: ${error.message}`, { fold: true })
    return answer(/commands_off/.test(error.message) ? "ការកត់ត្រាតាម Telegram ត្រូវបានបិទ" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true)
  }
  const r = data as { status: string; party?: string }
  if (r.status === "ok") {
    await answer("✅ បានកត់ជាការសងកម្ចី")
    logEvent("info", "debts", "Slip linked to a loan repayment", { fold: true })
    return sendText(chat.id, `✅ បានកត់ជាការសងកម្ចី «${r.party}» — ប្រភេទ «សងបំណុល» ហើយសមតុល្យកម្ចីត្រូវបានកាត់ក្នុងអេប លុយឆ្លាត។`)
  }
  const why: Record<string, string> = {
    already: "ការបង់នេះបានភ្ជាប់នឹងកម្ចីរួចហើយ។",
    currency: "រូបិយប័ណ្ណខុសពីកម្ចី — សូមកត់ការសងក្នុងអេប (បំណុល › សង)។",
    too_much: "ចំនួននេះលើសពីសមតុល្យកម្ចីដែលនៅសល់ — សូមពិនិត្យក្នុងអេប។",
    gone: "រកមិនឃើញការបង់ ឬកម្ចីនេះទេ (ឬផុតពេល)។",
    not_linked: "សូមភ្ជាប់គណនីជាមុនសិន ដោយប្រើ /start។",
  }
  return answer(why[r.status] ?? why.gone, true)
}

/**
 * «clc paid» / «បង់ clc» without an amount: the loan it names and its monthly installment (the LOAN
 * bill's amount, else the schedule's), never above what is left; null when the text names no single
 * open loan or isn't about paying.
 */
export async function paidDebtProposal(chatId: number, text: string, debts: BotDebt[]): Promise<{ debt: BotDebt; amount: number } | null> {
  if (!isPaidMessage(text)) return null
  const debt = matchPayableDebt(text, debts)
  if (!debt) return null
  const { data } = await botDb().rpc("bot_debt_installment", { p_key: botKey(), p_chat_id: chatId, p_debt_id: debt.id })
  const d = data as { installment: number | string | null; bill_amount?: number | string | null; remaining: number | string } | null
  const due = Number(d?.bill_amount ?? d?.installment ?? 0)
  if (!(due > 0)) return null
  return { debt, amount: Math.min(due, Number(d?.remaining ?? debt.remaining)) }
}

export const paidDebtLine = (debt: BotDebt, amount: number) => `🏦 រកឃើញកម្ចី «${debt.party_name}» ត្រូវបង់ ${formatMoney(amount, debt.currency)}។ តើបងបានបង់រួចរាល់មែនទេ?`
