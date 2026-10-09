// Server only: bank alerts forwarded to the bot (private chat) are saved at once
// into the wallet named with the account's last digits, with ↩️ Undo. The same
// alert twice is skipped. The balance shows only with the AI-numbers opt-in.
import { settleBillFromPayment } from "@/lib/server/bill-bot"
import { createHash } from "crypto"

import type { BankAlert } from "@/lib/bot/bank-alert"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** "bu:<transaction id>" — the ↩️ Undo button. */
export const isBankUndo = (data: string | undefined) => /^bu:/.test(data ?? "")

type Saved = {
  status: string
  transaction_id?: string
  wallet?: string
  workspace?: string
  type?: "INCOME" | "EXPENSE"
  amount?: number
  currency?: "USD" | "KHR"
  note?: string | null
  balance?: number | null
  wallet_currency?: "USD" | "KHR"
  suffix?: string
}

export async function handleBankAlert(chatId: number, alert: BankAlert, raw: string, lang: Locale) {
  // The same alert (same words) is the same transaction.
  const fingerprint = createHash("sha256").update(raw.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex").slice(0, 40)
  const { data, error } = await botDb().rpc("bot_bank_alert", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_alert: {
      amount: alert.amount,
      currency: alert.currency,
      direction: alert.direction,
      suffix: alert.suffix,
      party: alert.party,
      ref: alert.ref,
      kind: alert.kind,
      fingerprint,
      posted_at: alert.postedAt,
    },
  })
  const r = data as Saved | null
  if (error || !r) return sendText(chatId, tr(lang, "bot.saveFailed"))
  switch (r.status) {
    case "plan_required":
      return sendText(chatId, tr(lang, "bot.cmdPro"))
    case "commands_off":
      return sendText(chatId, tr(lang, "bot.cmdOff"))
    case "duplicate":
      return sendText(chatId, tr(lang, "bank.duplicate"))
    case "no_wallet":
      return sendText(chatId, tr(lang, "bank.noWallet", { suffix: alert.suffix }))
    case "other_workspace":
      return sendText(chatId, tr(lang, "bank.otherWorkspace", { suffix: alert.suffix, workspace: (data as { workspace?: string }).workspace ?? "" }))
    case "ok":
      break
    default:
      return sendText(chatId, tr(lang, "bot.saveFailed"))
  }
  const money = formatMoney(Number(r.amount), r.currency ?? "USD")
  const lines = [
    tr(lang, "bank.saved"),
    r.type === "INCOME" ? tr(lang, "bank.income", { amount: money }) : tr(lang, "bank.expense", { amount: money }),
    `👛 ${r.wallet} · 🏢 ${r.workspace}`,
    ...(r.note ? [`🧾 ${r.note}`] : []),
    // Only with "Let LuyChlat AI see my numbers" on (no balances in chat otherwise).
    ...(r.balance != null ? [tr(lang, "bank.balance", { amount: formatMoney(Number(r.balance), r.wallet_currency ?? "USD") })] : []),
  ]
  const sent = await sendText(chatId, lines.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: tr(lang, "bank.undo"), callback_data: `bu:${r.transaction_id}` }]] },
  })
  // Paying EDC / water / internet: the matching recurring bill is marked paid (↩️ Undo makes it unpaid again).
  if (r.type === "EXPENSE") await settleBillFromPayment(chatId, r.transaction_id, null, alert.party)
  return sent
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

/** ↩️ Undo: removes the entry the alert made, and says so on the card. */
export async function handleBankUndoCallback(cb: Callback, lang: Locale) {
  const chatId = cb.message?.chat.id
  const id = (cb.data ?? "").slice(3)
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id)) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const { data } = await botDb().rpc("bot_bank_undo", { p_key: botKey(), p_chat_id: chatId, p_transaction_id: id })
  const status = (data as { status?: string } | null)?.status
  const note = status === "undone" ? tr(lang, "bank.undone") : tr(lang, "bank.undoGone")
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: note })
  if (status === "undone") {
    await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${cb.message?.text ?? ""}\n\n${note}`.slice(0, 4000) })
  }
}
