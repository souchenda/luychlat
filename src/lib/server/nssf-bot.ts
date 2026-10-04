// Server only: Telegram /nssf — NSSF basics, and the account's own NSSF cards
// with 1-tap copy buttons (the ID itself stays masked in the chat).
import type { Locale } from "@/lib/i18n/dictionaries"

import { botDb, botKey, sendText, SIGNATURE, tr } from "./telegram-bot"

type Member = { name: string; relationship: "self" | "spouse" | "child"; nssf_id: string | null }

export async function sendNssfInfo(chatId: number, lang: Locale) {
  const { data } = await botDb().rpc("bot_nssf_members", { p_key: botKey(), p_chat_id: chatId })
  const members = (data as Member[] | null) ?? null
  const lines = [tr(lang, "bot.nssfInfo")]
  const buttons: { text: string; copy_text: { text: string } }[][] = []

  if (members === null) {
    lines.push("", tr(lang, "bot.nssfLinkHint"))
  } else if (!members.length) {
    lines.push("", tr(lang, "bot.nssfNoCards"))
  } else {
    lines.push("", tr(lang, "bot.nssfYourCards"))
    for (const m of members) {
      const id = m.nssf_id?.replace(/\s/g, "") ?? ""
      lines.push(`• ${m.name} (${tr(lang, `nssf.rel.${m.relationship}`)})${id ? ` · •••• ${id.slice(-4)}` : ""}`)
      if (id) buttons.push([{ text: tr(lang, "bot.nssfCopy", { name: m.name }), copy_text: { text: id } }])
    }
    lines.push("", tr(lang, "bot.nssfTotal", { count: members.length, monthly: (15600 * members.length).toLocaleString("en-US"), yearly: (187200 * members.length).toLocaleString("en-US") }))
  }
  return sendText(chatId, lines.join("\n") + SIGNATURE, buttons.length ? { reply_markup: { inline_keyboard: buttons.slice(0, 10) } } : {})
}
