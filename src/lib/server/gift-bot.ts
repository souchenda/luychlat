// Server only: the gift & merit ledger in the bot's private chat.
//   ចងដៃការ បងសុខា 50$ ABA  → card with ✅ / ❌ (saved only on ✅)
//   /gift សុខា              → what they gave us vs what we gave them, and what to give back
import { parseGiftText } from "@/lib/bot/parse-gift"
import type { Currency } from "@/lib/data/types"
import { giftEmoji, giftSummary, personKey, type Gift } from "@/lib/gift"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { botDb, botKey, sendText, tg, tr } from "@/lib/server/telegram-bot"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** "gk:<id>" save / "gx:<id>" drop on a gift card. */
export const isGiftCallback = (data: string | undefined) => /^g[kx]:/.test(data ?? "")

function statusText(status: string | undefined, lang: Locale) {
  if (status === "plan_required") return tr(lang, "bot.cmdPro")
  if (status === "commands_off") return tr(lang, "bot.cmdOff")
  if (status === "not_writable") return tr(lang, "bot.cmdReadonly")
  if (status === "not_linked") return tr(lang, "bot.notLinked")
  return tr(lang, "bot.saveFailed")
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const totals = (m: Partial<Record<Currency, number>>) =>
  (Object.entries(m) as [Currency, number][]).map(([c, n]) => formatMoney(n, c)).join(" + ") || "—"

export async function handleGiftMessage(chatId: number, text: string, lang: Locale) {
  const { data } = await botDb().rpc("bot_gift_context", { p_key: botKey(), p_chat_id: chatId })
  const ctx = data as { status: string; workspace?: string; wallets?: { id: string; name: string; icon?: string | null }[] } | null
  if (ctx?.status !== "ok") return sendText(chatId, statusText(ctx?.status, lang))
  const g = parseGiftText(text, ctx.wallets ?? [])
  if (!g) return sendText(chatId, tr(lang, "gift.bot.help"))

  const { data: id } = await botDb().rpc("bot_gift_propose", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_payload: { direction: g.direction, person: g.person, event_type: g.eventType, title: g.title, amount: g.amount, currency: g.currency, wallet_id: g.walletId },
  })
  if (typeof id !== "string") return sendText(chatId, tr(lang, "bot.saveFailed"))
  const lines = [
    `${giftEmoji(g.eventType)} ${tr(lang, g.direction === "given" ? "gift.bot.given" : "gift.bot.received")}`,
    `👤 ${g.person}${g.title ? ` · ${g.title}` : ""}`,
    `💵 ${formatMoney(g.amount, g.currency)} · ${tr(lang, `gift.event.${g.eventType}` as MessageKey)}`,
    g.walletName
      ? `👛 ${g.walletName}`
      : g.missingWallet
        ? tr(lang, "gift.bot.noSuchWallet", { wallet: g.missingWallet, workspace: ctx.workspace ?? "" })
        : tr(lang, "gift.bot.recordOnly"),
    "",
    tr(lang, "gift.bot.confirmQ"),
  ]
  return sendText(chatId, lines.join("\n"), {
    reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.confirm"), callback_data: `gk:${id}` }, { text: tr(lang, "bot.cancel"), callback_data: `gx:${id}` }]] },
  })
}

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

export async function handleGiftCallback(cb: Callback, lang: Locale) {
  const chatId = cb.message?.chat.id
  const [verb, id] = (cb.data ?? "").split(":", 2)
  if (!chatId || cb.message?.chat.type !== "private" || !UUID.test(id ?? "")) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const { data, error } = await botDb().rpc("bot_gift_decide", { p_key: botKey(), p_chat_id: chatId, p_pending_id: id, p_save: verb === "gk" })
  const status = (data as { status?: string } | null)?.status
  const outcome = error
    ? tr(lang, "bot.saveFailed")
    : status === "saved"
      ? tr(lang, "gift.bot.saved")
      : status === "cancelled"
        ? tr(lang, "bot.cancelled")
        : status === "expired"
          ? tr(lang, "bot.expired")
          : tr(lang, "bot.saveFailed")
  await tg("answerCallbackQuery", { callback_query_id: cb.id })
  const details = (cb.message?.text ?? "").split("\n\n")[0]
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${details}\n\n${outcome}`.slice(0, 4000) })
}

/** /gift <name>: the two-way history and what to give back. /gift alone: how to use it. */
export async function handleGiftLookup(chatId: number, name: string, lang: Locale) {
  if (name.trim().length < 2) return sendText(chatId, tr(lang, "gift.bot.help"))
  const { data } = await botDb().rpc("bot_gift_lookup", { p_key: botKey(), p_chat_id: chatId, p_name: name })
  const r = data as { status: string; entries?: Gift[] } | null
  if (r?.status !== "ok") return sendText(chatId, statusText(r?.status, lang))
  const entries = (r.entries ?? []).map((e) => ({ ...e, person_name: (e as unknown as { person: string }).person, event_date: (e as unknown as { date: string }).date, amount: Number(e.amount) }))
  if (!entries.length) return sendText(chatId, tr(lang, "gift.bot.none", { name: name.trim() }))

  // Several people can match ("សុខា"): one summary each, most recent first.
  const people = new Map<string, typeof entries>()
  for (const e of entries) people.set(personKey(e.person_name), [...(people.get(personKey(e.person_name)) ?? []), e])
  const blocks = [...people.values()].slice(0, 3).map((list) => {
    const s = giftSummary(list)
    const lines = [
      `👤 ${list[0].person_name}`,
      tr(lang, "gift.bot.theyGave", { amount: totals(s.received), count: s.countReceived }),
      tr(lang, "gift.bot.weGave", { amount: totals(s.given), count: s.countGiven }),
    ]
    if (s.lastReceived) lines.push(tr(lang, "gift.bot.last", { emoji: giftEmoji(s.lastReceived.event_type), amount: formatMoney(s.lastReceived.amount, s.lastReceived.currency), date: ddmmyyyy(s.lastReceived.event_date) }))
    if (s.suggestion) {
      lines.push(tr(lang, s.suggestion.basis === "they_gave" ? "gift.bot.suggestBack" : "gift.bot.suggestSame", { amount: formatMoney(s.suggestion.amount, s.suggestion.currency) }))
    }
    return lines.join("\n")
  })
  return sendText(chatId, blocks.join("\n\n"))
}
