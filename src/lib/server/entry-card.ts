// Server only: the "saved" card under an entry recorded from Telegram (a bank
// slip, or a typed / spoken entry): what was booked, its meal and Need / Want,
// the note, and one tap to change any of them (callbacks st:<tx>:… in slip-bot).
import { categoryLabel } from "@/lib/categories/presets"
import { MEALS, walletLabel, type Meal } from "@/lib/bot/bank-slip"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { botDb, botKey, maskNumbers, tr } from "@/lib/server/telegram-bot"

export type Tagged = {
  amount: number
  currency: "USD" | "KHR"
  /** "ACLEDA KHR · 016***4222" (walletLabel). */
  wallet: string
  /** The category line as shown ("🍲 Food"). */
  label: string
  food: boolean
  subcategory: Meal | null
  need_want: "NEED" | "WANT" | null
  /** Spending on the children (👶 សម្រាប់កូន). */
  for_child?: boolean
  /** The user's own words (without the slip's "🧾 …" part). */
  note?: string | null
}

/** A caption or reply as a note: one line, at most 300 characters. */
export const cleanNote = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null
/** The user's part of a stored note: everything but the slip's "🧾 bank → payee". */
export const userPart = (note: string | null | undefined) =>
  (note ?? "")
    .split(" · ")
    .filter((s) => s && !s.startsWith("🧾"))
    .join(" · ") || null

export const MEAL_CODE: Record<Meal, string> = { breakfast: "b", lunch: "l", dinner: "d", snack: "s" }
export const MEAL_KEY: Record<Meal, MessageKey> = { breakfast: "bot.meal.breakfast", lunch: "bot.meal.lunch", dinner: "bot.meal.dinner", snack: "bot.meal.snack" }

/** The saved card: what was booked, its meal and Need / Want, and one tap to change either (✓ marks the current one). */
export function savedCard(lang: Locale, txId: string, t: Tagged) {
  const text = [
    tr(lang, "bot.slipSaved"),
    `💵 ${formatMoney(Number(t.amount), t.currency)}`,
    `👛 ${t.wallet}`,
    `🏷️ ${t.label}${t.food && t.subcategory ? ` · ${tr(lang, MEAL_KEY[t.subcategory])}` : ""}`,
    ...(t.need_want ? [tr(lang, t.need_want === "NEED" ? "bot.need" : "bot.want")] : []),
    ...(t.for_child ? [tr(lang, "bot.forChildOn")] : []),
    ...(t.note ? [`📝 ${t.note}`] : []),
  ].join("\n")
  const mark = (on: boolean, label: string) => (on ? `✓ ${label}` : label)
  const keyboard: { text: string; callback_data: string }[][] = []
  if (t.food)
    keyboard.push(MEALS.map((m) => ({ text: mark(t.subcategory === m, tr(lang, MEAL_KEY[m])), callback_data: `st:${txId}:${MEAL_CODE[m]}` })))
  keyboard.push([
    { text: mark(t.need_want === "NEED", tr(lang, "bot.need")), callback_data: `st:${txId}:N` },
    { text: mark(t.need_want === "WANT", tr(lang, "bot.want")), callback_data: `st:${txId}:W` },
  ])
  keyboard.push([
    { text: mark(Boolean(t.for_child), tr(lang, "bot.forChild")), callback_data: `st:${txId}:${t.for_child ? "K0" : "K1"}` },
    { text: tr(lang, t.note ? "bot.noteBtnEdit" : "bot.noteBtn"), callback_data: `st:${txId}:T` },
  ])
  return { text: maskNumbers(text), reply_markup: { inline_keyboard: keyboard } }
}

export async function tagTransaction(chatId: number, txId: string, meal: Meal | null, needWant: "NEED" | "WANT" | null, forChild: boolean | null = null) {
  const { data, error } = await botDb().rpc("bot_tx_tag", { p_key: botKey(), p_chat_id: chatId, p_tx_id: txId, p_subcategory: meal, p_need_want: needWant, p_for_child: forChild })
  return { data: data as ({ ok?: boolean; category?: string | null; preset?: string | null; account_no?: string | null } & Partial<Tagged>) | null, error }
}

export type TaggedRow = { amount?: number; currency?: "USD" | "KHR"; wallet?: string; account_no?: string | null; category?: string | null; preset?: string | null; subcategory?: Meal | null; need_want?: "NEED" | "WANT" | null; note?: string | null; for_child?: boolean }
/** The saved card's data from a row returned by bot_tx_tag / bot_tx_note. */
export function taggedFrom(lang: Locale, d: TaggedRow): Tagged {
  const food = d.preset === "food"
  return {
    amount: Number(d.amount),
    currency: d.currency ?? "USD",
    wallet: walletLabel({ name: d.wallet ?? "", account_no: d.account_no ?? null }),
    label: d.category ? `${food ? "🍲 " : ""}${categoryLabel({ name: d.category, preset_key: d.preset ?? null }, lang)}` : tr(lang, "entry.uncategorized"),
    food,
    subcategory: d.subcategory ?? null,
    need_want: d.need_want ?? null,
    for_child: Boolean(d.for_child),
    note: userPart(d.note),
  }
}

/**
 * A saved card is remembered as its own note prompt (founder, 20/10/2026): replying to the card sets the entry's note
 * (bot_tx_note), and a text without an amount within 5 minutes of it does too (bot_tx_note_recent).
 */
export async function rememberCard(chatId: number, txId: string, messageId: number | null | undefined) {
  if (!messageId) return
  await botDb()
    .rpc("bot_note_prompt_set", { p_key: botKey(), p_chat_id: chatId, p_message_id: messageId, p_tx_id: txId, p_card_msg: messageId })
    .then(() => null, () => null)
}

/** Short replies that are not a note: thanks, yes / no, greetings, a question. */
const NOT_A_NOTE = /^(អរគុណ\S*|ok(ay)?|👍|✅|បាទ|ចាស|ទេ|hi|hello|សួស្តី|thanks?|thank you|thx|yes|no|谢谢|好的?|嗯)[!.។\s]*$/iu

export const looksLikeNote = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length >= 3 && !t.startsWith("/") && !/[?？]\s*$/.test(t) && !NOT_A_NOTE.test(t)
}

/** «✅ បានបន្ថែមចំណាំ៖ «{note}» លើប្រតិបត្តិការ {amount} រួចរាល់!» and «📁 ប្រភេទ៖ {category}». */
export function recentNoteText(lang: Locale, o: { note: string; amount: number; currency: "USD" | "KHR"; category: string | null; preset: string | null }) {
  const category = o.category ? categoryLabel({ name: o.category, preset_key: o.preset }, lang) : tr(lang, "entry.uncategorized")
  return [tr(lang, "bot.recentNoteSaved", { note: o.note, amount: formatMoney(o.amount, o.currency) }), tr(lang, "bot.recentNoteCategory", { category })].join("\n")
}

/**
 * The note speaks of a child («កូន», «កូនស្រី», «ទារក», kid, baby…) → the entry is tagged «👶 សម្រាប់កូន» (founder,
 * 20/10/2026); the card's button turns it off in one tap. «កូន» in words that are not a child (កូនសោ a key, កូនបំណុល a
 * debtor, កូនជាង an apprentice…) does not count.
 */
const NOT_CHILD = ["កូនសោ", "កូនបំណុល", "កូនជាង", "កូនឈ្នួល", "កូនក្តី", "កូនក្ដី", "កូនកាត់", "កូនកាំបិត", "កូនឈើ", "កូនត្រី", "កូនមាន់", "កូនជ្រូក", "កូនគោ", "កូនឆ្កែ", "កូនឆ្មា", "កូនទា", "កូនអុក", "កូនប៉ោល", "កូនផ្ទះ", "កូនជួល"]
export function mentionsChild(text: string): boolean {
  let t = ` ${text.toLowerCase()} `
  for (const w of NOT_CHILD) t = t.split(w).join(" ")
  return /កូន|ទារក|孩子|宝宝|儿子|女儿/.test(t) || /(^|[^a-z])(kids?|baby|babies|child|children|son|daughter)([^a-z]|$)/.test(t)
}
