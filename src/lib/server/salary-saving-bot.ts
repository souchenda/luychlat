// Server only: «💰 ប្រាក់ខែចូលហើយ — ផ្ទេរ … ទៅគោលដៅ … ទេ?» after a salary is recorded through the bot (founder, 4/11/2026 —
// Personal; lib/salary-saving.ts computes the amount, migration 20270290000000 checks and moves the money on ✅ only).
import type { Currency } from "@/lib/data/types"
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { salarySaving } from "@/lib/salary-saving"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, maskNumbers, sendText, tg, tr } from "@/lib/server/telegram-bot"

type GoalRow = { id: string; name: string; currency: Currency; balance: number | string; target: number | string; date: string | null; saved_month: number | string }
type Data = { status: string; wallet_id?: string; amount?: number | string; currency?: Currency; rate?: number | string; goals?: GoalRow[] }
type SavingCallback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number; type: string } } }

/** «sv:<id>:y» transfer / «sv:<id>:n» later. */
export const isSalarySavingCallback = (data: string | undefined) => /^sv:\d+:[yn]$/.test(data ?? "")

const cambodiaToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/** A salary just saved in a Personal book: the goal that needs money this month → the question. Silent otherwise. */
export async function offerSalarySaving(chatId: number, txId: string, lang: Locale): Promise<void> {
  if (chatId <= 0) return
  const { data, error } = await botDb().rpc("bot_salary_goal_data", { p_key: botKey(), p_chat_id: chatId, p_tx_id: txId })
  const d = data as Data | null
  if (error || d?.status !== "ok" || !d.currency) return
  const rate = Number(d.rate) || 4000
  const s = salarySaving({
    income: { amount: Number(d.amount), currency: d.currency },
    goals: (d.goals ?? []).map((g) => ({ id: g.id, name: g.name, currency: g.currency, balance: Number(g.balance), target: Number(g.target), date: g.date, savedThisMonth: Number(g.saved_month) })),
    today: cambodiaToday(),
    khrPerUsd: rate,
  })
  if (!s) return
  const { data: id, error: offerError } = await botDb().rpc("bot_salary_goal_offer", { p_key: botKey(), p_tx_id: txId, p_goal: s.goalId, p_from: s.fromAmount, p_to: s.toAmount, p_rate: rate })
  if (offerError || !id) {
    if (offerError) logEvent("warn", "bot", `Saving nudge not offered: ${offerError.message}`, { fold: true })
    return
  }
  const amount = s.fromCurrency === s.goalCurrency ? formatMoney(s.toAmount, s.goalCurrency) : `${formatMoney(s.fromAmount, s.fromCurrency)} (= ${formatMoney(s.toAmount, s.goalCurrency)})`
  const res = await sendText(chatId, tr(lang, "bot.saveGoalAsk", { amount, goal: s.goalName }), {
    reply_markup: { inline_keyboard: [[{ text: tr(lang, "bot.saveGoalYes"), callback_data: `sv:${id}:y` }], [{ text: tr(lang, "bot.saveGoalLater"), callback_data: `sv:${id}:n` }]] },
  })
  logEvent(res.ok ? "info" : "warn", "bot", `Saving nudge for a goal: ${res.ok ? "reached the chat" : `not sent (${res.description ?? "unknown"})`}`, { fold: true })
}

/** ✅ / ពេលក្រោយ: the database checks the person and the goal again, then the question becomes the outcome. */
export async function handleSalarySavingCallback(cb: SavingCallback, lang: Locale): Promise<void> {
  const chatId = cb.message?.chat.id
  const [, id, yn] = (cb.data ?? "").split(":")
  if (!chatId || cb.message?.chat.type !== "private") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id })
    return
  }
  const { data, error } = await botDb().rpc("bot_salary_goal_transfer", { p_key: botKey(), p_chat_id: chatId, p_id: Number(id), p_accept: yn === "y" })
  const r = data as { status?: string; goal?: string; to_amount?: number | string; currency?: Currency; percent?: number | null; reason?: string } | null
  const outcome =
    error || !r
      ? tr(lang, "bot.saveFailed")
      : r.status === "done"
        ? tr(lang, "bot.saveGoalDone", { amount: formatMoney(Number(r.to_amount), r.currency ?? "USD"), goal: r.goal ?? "" })
        : r.status === "later"
          ? tr(lang, "bot.saveGoalLaterDone")
          : r.status === "already"
            ? tr(lang, "bot.debtMatchAlready")
            : r.status === "failed"
              ? tr(lang, "bot.saveGoalFailed")
              : tr(lang, "bot.expired")
  if (error || r?.status === "failed") logEvent("warn", "bot", `Saving transfer not made: ${error?.message ?? r?.reason ?? "?"}`, { fold: true })
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: outcome.slice(0, 190) })
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: maskNumbers(`${cb.message?.text ?? ""}\n\n${outcome}`).slice(0, 4000) }).catch(() => null)
}
