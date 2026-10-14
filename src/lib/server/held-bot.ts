// Server only: held payments — the bot asks instead of guessing which wallet (founder, 14/10/2026).
//   KHQR sale, no wallet of the receiving bank → the business owner is asked privately (and a bell
//     notification is made by the database), never booked into Cash or another bank's wallet.
//   Bank alert whose last digits match two or more wallets → the chat that sent it is asked.
// A tap books it through the same database function with the chosen wallet.
import { heldButtons, parseHeldCallback, type HeldChoice } from "@/lib/bot/held"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { savedCard, type Saved } from "@/lib/server/bank-alert-bot"
import { settleBillFromPayment } from "@/lib/server/bill-bot"
import { ownerText, transferText, type TransferResult } from "@/lib/server/biz-group-bot"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, maskNumbers, sendText, tg, tr } from "@/lib/server/telegram-bot"

export type Held = {
  status: string
  held_id?: string
  fresh?: boolean
  choices?: HeldChoice[]
  workspace?: string
  amount?: number
  currency?: "USD" | "KHR"
  bank?: string
  payer?: string | null
  count?: number
}

const asLocale = (l: unknown): Locale => (l === "en" || l === "zh" ? l : "km")
const WALLETS_URL = "https://app.luychlat.com/wallets"

/** A KHQR sale with no wallet of the receiving bank: ask the business owner(s) privately. True when someone was asked. */
export async function askHeldKhqr(where: { workspaceId?: string | null; group?: number | null }, r: Held): Promise<boolean> {
  if (!r.held_id || !r.choices?.length) return false
  // A retry of the same payment: already asked once.
  if (r.fresh === false) return true
  const { data } = await botDb().rpc("bot_biz_owner_chats", { p_key: botKey(), p_workspace_id: where.workspaceId ?? null, p_group: where.group ?? null })
  const chats = (data as { chat_id: number; language: string | null }[] | null) ?? []
  if (!chats.length) {
    logEvent("warn", "khqr", `KHQR payment held (no ${r.bank} wallet) — owner has no linked Telegram; on the bell only`, { fold: true })
    return false
  }
  let asked = false
  for (const c of chats) {
    const lang = asLocale(c.language)
    const text = tr(lang, "held.khqrAsk", {
      amount: formatMoney(Number(r.amount), r.currency ?? "USD"),
      payer: r.payer?.trim() ? ` · ${r.payer.trim()}` : "",
      bank: r.bank ?? "",
      workspace: r.workspace ?? "",
    })
    const res = await sendText(Number(c.chat_id), text, {
      reply_markup: { inline_keyboard: heldButtons(r.held_id, r.choices, { text: tr(lang, "held.createWallet", { bank: r.bank ?? "" }), url: WALLETS_URL }) },
    })
    if (res.ok) asked = true
    else logEvent("warn", "khqr", `KHQR hold question not delivered: ${res.description ?? "unknown"}`, { fold: true })
  }
  return asked
}

/** A bank alert whose last digits match two or more wallets: ask the chat that sent it. */
export async function askBankWallet(chatId: number, r: Held, suffix: string, lang: Locale) {
  if (!r.held_id || !r.choices?.length) return sendText(chatId, tr(lang, "bot.saveFailed"))
  return sendText(
    chatId,
    tr(lang, "held.bankAsk", { count: r.count ?? r.choices.length, suffix, amount: formatMoney(Number(r.amount), r.currency ?? "USD") }),
    { reply_markup: { inline_keyboard: heldButtons(r.held_id, r.choices) } },
  )
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

type Booked = Saved & TransferResult & { kind?: "KHQR" | "BANK_ALERT"; payer?: string | null; party?: string | null }

/** A tap on a held payment's wallet: book it, and the question becomes the confirmation. */
export async function handleHeldCallback(cb: Callback, lang: Locale) {
  const chatId = cb.message?.chat.id
  const pick = parseHeldCallback(cb.data)
  if (!chatId || cb.message?.chat.type !== "private" || !pick) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const { data, error } = await botDb().rpc("bot_held_book", { p_key: botKey(), p_chat_id: chatId, p_held: pick.id, p_idx: pick.idx })
  const r = data as Booked | null
  if (error || !r) {
    logEvent("error", "held", `Held payment not booked: ${error?.message ?? "no answer"}`, { fold: true })
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: tr(lang, "bot.saveFailed").slice(0, 190), show_alert: true })
    return
  }
  const edit = (text: string, reply_markup?: unknown) =>
    tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(text).slice(0, 4000), ...(reply_markup ? { reply_markup } : {}) })

  if (r.status === "already" || r.status === "gone") {
    const note = tr(lang, r.status === "already" ? "held.already" : "held.gone")
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: note })
    await edit(`${cb.message?.text ?? ""}\n\n${note}`)
    return
  }
  if (r.status === "ok" || r.status === "transfer" || r.status === "duplicate") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: tr(lang, "held.booked", { wallet: r.wallet ?? "" }).slice(0, 190) })
    if (r.kind === "BANK_ALERT") {
      if (r.status === "duplicate") {
        await edit(`${cb.message?.text ?? ""}\n\n${tr(lang, "bank.duplicate")}`)
        return
      }
      const card = savedCard(r, lang)
      await edit(card.text, card.reply_markup)
      if (r.type === "EXPENSE") await settleBillFromPayment(chatId, r.transaction_id, null, r.party ?? null)
      return
    }
    logEvent("info", "khqr", `Held KHQR ${r.bank} payment booked by the owner (${r.workspace})`, { fold: true })
    await edit(r.status === "transfer" ? transferText(r) : r.status === "ok" ? await ownerText(r, r.payer) : `${cb.message?.text ?? ""}\n\n${tr(lang, "held.already")}`)
    return
  }
  // not_linked / not_writable / plan_required / invalid: said, and the question stays for someone who can.
  const reason = r.status === "plan_required" ? tr(lang, "bot.cmdPro") : tr(lang, "bot.saveFailed")
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: reason.slice(0, 190), show_alert: true })
}
