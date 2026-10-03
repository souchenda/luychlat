// Server only: chat logging for the official bot (Phase C part 2).
import { parseEntry, type BotCategory, type BotDebt, type BotWallet } from "@/lib/bot/parse-entry"
import type { Locale } from "@/lib/i18n/dictionaries"
import { convert, formatMoney } from "@/lib/money"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"

/**
 * A text message from a linked chat becomes a confirmation card; nothing is
 * saved until ✅. The database re-checks everything on ✅ (link, opt-in, PRO,
 * write access, ids in the workspace), so the server only proposes.
 */

type Context = {
  linked: boolean
  pro?: boolean
  enabled?: boolean
  writable?: boolean
  language?: Locale | null
  rate?: number
  wallets?: BotWallet[]
  categories?: BotCategory[]
  debts?: BotDebt[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function botContext(chatId: number): Promise<Context | null> {
  const { data, error } = await botDb().rpc("bot_context", { p_key: botKey(), p_chat_id: chatId })
  return error ? null : (data as Context)
}

export const contextLocale = (ctx: Context | null): Locale => (ctx?.language === "en" ? "en" : "km")

/** Handles a non-command message from a linked chat. */
export async function handleEntryMessage(chatId: number, text: string, ctx: Context) {
  const lang = contextLocale(ctx)
  if (!ctx.pro) return sendText(chatId, tr(lang, "bot.cmdPro"))
  if (!ctx.enabled) return sendText(chatId, tr(lang, "bot.cmdOff"))
  if (!ctx.writable) return sendText(chatId, tr(lang, "bot.cmdReadonly"))

  const rate = Number(ctx.rate) || 4000
  const wallets = (ctx.wallets ?? []).map((w) => ({ ...w }))
  const debts = (ctx.debts ?? []).map((d) => ({ ...d, remaining: Number(d.remaining) }))
  const parsed = parseEntry(text, { wallets, categories: ctx.categories ?? [], debts, rate })

  if (!parsed.ok) {
    if (parsed.reason === "no_amount") return sendText(chatId, tr(lang, "bot.cmdNoAmount"))
    if (parsed.reason === "no_wallet") return sendText(chatId, tr(lang, "bot.cmdNoWallet"))
    if (parsed.reason === "too_much" && parsed.debt) {
      return sendText(chatId, tr(lang, "bot.cmdTooMuch", { party: parsed.debt.party_name, remaining: formatMoney(parsed.debt.remaining, parsed.debt.currency) }))
    }
    const list = debts.map((d) => `${d.party_name} (${formatMoney(d.remaining, d.currency)})`).join(", ")
    return sendText(chatId, list ? tr(lang, "bot.cmdNoDebt", { list }) : tr(lang, "bot.cmdNoDebts"))
  }

  const action =
    parsed.kind === "REPAY"
      ? { kind: "REPAY", debt_id: parsed.debt.id, wallet_id: parsed.wallet.id, amount: parsed.amount, note: parsed.note }
      : { kind: parsed.kind, wallet_id: parsed.wallet.id, category_id: parsed.category?.id ?? null, amount: parsed.amount, currency: parsed.currency, note: parsed.note }
  const { data: pendingId, error } = await botDb().rpc("bot_propose", { p_key: botKey(), p_chat_id: chatId, p_action: action })
  if (error || typeof pendingId !== "string") return sendText(chatId, tr(lang, "bot.saveFailed"))

  // The card: what will be saved, from which wallet, and in its currency when they differ.
  const money = formatMoney(parsed.amount, parsed.currency)
  const fromWallet =
    parsed.wallet.currency === parsed.currency
      ? `👛 ${parsed.wallet.name}`
      : `👛 ${parsed.wallet.name} (≈ ${formatMoney(convert(parsed.amount, parsed.currency, parsed.wallet.currency, rate), parsed.wallet.currency)})`
  const lines =
    parsed.kind === "REPAY"
      ? [
          tr(lang, parsed.debt.type === "PAYABLE" ? "bot.cardRepayOut" : "bot.cardRepayIn", { party: parsed.debt.party_name }),
          `💵 ${money}`,
          fromWallet,
          tr(lang, "bot.cardRemaining", { amount: formatMoney(parsed.debt.remaining - parsed.amount, parsed.debt.currency) }),
        ]
      : [
          tr(lang, parsed.kind === "INCOME" ? "bot.cardIncome" : "bot.cardExpense"),
          `💵 ${money}`,
          fromWallet,
          `🏷️ ${parsed.category?.name ?? tr(lang, "bot.cardUncategorized")}`,
        ]
  lines.push(`📝 ${parsed.note}`, "", tr(lang, "bot.cardAsk"))
  return sendText(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: tr(lang, "bot.confirm"), callback_data: `ok:${pendingId}` },
          { text: tr(lang, "bot.cancel"), callback_data: `no:${pendingId}` },
        ],
      ],
    },
  })
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

type Confirmed = {
  ok: boolean
  reason?: string
  kind?: string
  wallet?: string
  balance?: number
  wallet_currency?: "USD" | "KHR"
  remaining?: number
  debt_currency?: "USD" | "KHR"
  party?: string
}

/** ✅ / ❌ on a card: save or drop it, then replace the buttons with the outcome. */
export async function handleCallback(cb: Callback) {
  const chatId = cb.message?.chat.id
  const [verb, id] = (cb.data ?? "").split(":", 2)
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id ?? "") || (verb !== "ok" && verb !== "no")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const ctx = await botContext(chatId)
  const lang = contextLocale(ctx)
  const db = botDb()
  let outcome: string
  if (verb === "no") {
    await db.rpc("bot_cancel", { p_key: botKey(), p_chat_id: chatId, p_pending_id: id })
    outcome = tr(lang, "bot.cancelled")
  } else {
    const { data, error } = await db.rpc("bot_confirm", { p_key: botKey(), p_chat_id: chatId, p_pending_id: id })
    const r = data as Confirmed | null
    if (error) {
      const msg = error.message ?? ""
      outcome = /plan_required/.test(msg)
        ? tr(lang, "bot.cmdPro")
        : /commands_off/.test(msg)
          ? tr(lang, "bot.cmdOff")
          : /not_writable/.test(msg)
            ? tr(lang, "bot.cmdReadonly")
            : tr(lang, "bot.saveFailed")
    } else if (!r?.ok) {
      outcome = tr(lang, "bot.expired")
    } else {
      const balance = formatMoney(Number(r.balance), r.wallet_currency ?? "USD")
      outcome =
        r.kind === "REPAY"
          ? tr(lang, "bot.savedRepay", { party: r.party ?? "", remaining: formatMoney(Number(r.remaining), r.debt_currency ?? "USD"), wallet: r.wallet ?? "", balance })
          : tr(lang, "bot.saved", { wallet: r.wallet ?? "", balance })
    }
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  // Keep the card's details, drop the question and buttons, add the outcome.
  const card = (cb.message?.text ?? "").split("\n\n")[0]
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${card}\n\n${outcome}`.slice(0, 4000) })
}
