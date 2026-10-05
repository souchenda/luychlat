// Server only: the bot's persistent 1-tap keyboard (private chats).
import type { Locale } from "@/lib/i18n/dictionaries"

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

/** `extra` for sendText: the keyboard, sized to fit, kept open. */
export const menuKeyboard = (lang: Locale) => ({
  reply_markup: {
    keyboard: LABELS[lang].map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    is_persistent: true,
  },
})
