// Server only: the bot's persistent 1-tap keyboard (private chats).
import type { Locale } from "@/lib/i18n/dictionaries"

import { botDb, botKey } from "./telegram-bot"

/** Command behind each button, by position (same in every language). */
const COMMANDS = [["/market", "/fuel"], ["/gold", "/rate"], ["/digest", "/nssf"], ["/invoice", "/ai"], ["/gift", "/lang"]]

const LABELS: Record<Locale, string[][]> = {
  km: [["📊 ហាងឆេងទីផ្សារ", "⛽ តម្លៃប្រេង & ហ្កាស"], ["🪙 ហាងឆេងមាស", "💵 អត្រាប្តូរប្រាក់"], ["📈 សង្ខេបសប្តាហ៍", "🏥 កាត & ព័ត៌មាន ប.ស.ស."], ["🧾 បង្កើតវិក្កយបត្រ", "🤖 សួរទីប្រឹក្សា AI"], ["🎁 ចំណងដៃ & បច្ច័យ", "🌐 ប្តូរភាសា / Language"]],
  en: [["📊 Market Snapshot", "⛽ Fuel & Gas"], ["🪙 Gold Prices", "💵 Exchange Rates"], ["📈 Weekly Digest", "🏥 NSSF Info"], ["🧾 New Invoice", "🤖 Ask AI Advisor"], ["🎁 Gifts & Merit", "🌐 Language"]],
  zh: [["📊 今日市场", "⛽ 油气价格"], ["🪙 黄金价格", "💵 官方汇率"], ["📈 每周财务", "🏥 国家社保"], ["🧾 开发票", "🤖 问 AI 顾问"], ["🎁 礼金 & 功德", "🌐 切换语言"]],
}

/** Button text (any language) → the command it stands for. */
const BY_TEXT = new Map(
  (Object.values(LABELS) as string[][][]).flatMap((rows) => rows.flatMap((row, r) => row.map((label, c) => [label, COMMANDS[r][c]] as const))),
)

/** The command a tapped button stands for, or null for ordinary text. */
export const menuCommand = (text: string) => BY_TEXT.get(text.trim()) ?? null

/** Buttons of features still in testing (public.feature_flags), by command. */
const COMMAND_FEATURE: Record<string, string> = { "/invoice": "invoices", "/gift": "gifts" }

/** What the account linked to this chat may use ({} when unknown: gated features stay hidden). */
export async function botFeatures(chatId: number): Promise<Record<string, boolean>> {
  const { data, error } = await botDb().rpc("bot_features", { p_key: botKey(), p_chat_id: chatId })
  return error || !data ? {} : (data as Record<string, boolean>)
}

/** May this chat use the feature? */
export const featureOk = (features: Record<string, boolean>, key: string) => features[key] === true

/**
 * `extra` for sendText: the keyboard, sized to fit, kept open. Buttons of a
 * feature in testing appear only when `features` allows it.
 */
export const menuKeyboard = (lang: Locale, features: Record<string, boolean> = {}) => ({
  reply_markup: {
    keyboard: LABELS[lang]
      .map((row, r) => row.filter((_, c) => !COMMAND_FEATURE[COMMANDS[r][c]] || featureOk(features, COMMAND_FEATURE[COMMANDS[r][c]])).map((text) => ({ text })))
      .filter((row) => row.length > 0),
    resize_keyboard: true,
    is_persistent: true,
  },
})

/** The keyboard for this chat's account. */
export const keyboardFor = async (chatId: number, lang: Locale) => menuKeyboard(lang, await botFeatures(chatId))
