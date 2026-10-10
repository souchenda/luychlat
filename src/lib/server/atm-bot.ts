// Server only: /atm — the nearest ATMs and branches, from a shared location (private chat) or a place
// name ("/atm តាកែវ", "/atm aba សៀមរាប", in groups too). Public data: no account needed.
import { BANKS, nearest, nearestText, placeFrom, type BankCode } from "@/lib/atm"
import { PROVINCES, TOWNS } from "@/lib/kh-towns"

import { loadAtms } from "./atm-sync"
import { sendText, tg } from "./telegram-bot"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const LOCATION_BUTTON = "📍 ផ្ញើទីតាំងរបស់ខ្ញុំ"

/** The bank named in the words ("aba", "ACLEDA", "វីង"), and the words left for the place. */
export function bankAndPlace(args: string): { bank: BankCode | null; place: string } {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const i = words.findIndex((w) => BANKS.some((b) => b.match.test(w)))
  if (i < 0) return { bank: null, place: words.join(" ") }
  const bank = BANKS.find((b) => b.match.test(words[i]))!.code
  return { bank, place: words.filter((_, j) => j !== i).join(" ") }
}

async function answer(chatId: number, from: { lat: number; lng: number }, bank: BankCode | null, title?: string) {
  const rows = nearest(await loadAtms(), from, { bank, radiusKm: 10, limit: 5 })
  const text = nearestText(rows, esc)
  await tg("sendMessage", {
    chat_id: chatId,
    text: title && rows.length ? text.replace("ដែលនៅជិតបងបំផុត៖", `នៅ${esc(title)}៖`) : text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(chatId > 0 ? { reply_markup: { remove_keyboard: true } } : {}),
  })
}

/** /atm [bank] [place]. Without a place, a private chat gets the one-tap location button. */
export async function handleAtmCommand(chatId: number, args: string) {
  const { bank, place } = bankAndPlace(args)
  if (place) {
    const at = placeFrom(place, PROVINCES, TOWNS)
    if (at) return answer(chatId, at, bank, at.name)
    return sendText(chatId, `🏧 រកមិនឃើញទីកន្លែង «${place}» ទេ។ សូមវាយឈ្មោះខេត្ត ឬក្រុង ឧ. «/atm តាកែវ» «/atm សៀមរាប»។`)
  }
  if (chatId < 0) return sendText(chatId, "🏧 សូមវាយឈ្មោះខេត្ត ឬក្រុង ឧ. «/atm តាកែវ» ឬផ្ញើទីតាំងក្នុងការជជែកផ្ទាល់ជាមួយបូត។")
  return sendText(chatId, "🏧 ចុចប៊ូតុងខាងក្រោម ដើម្បីផ្ញើទីតាំងបច្ចុប្បន្ន — បូតនឹងរកទូ ATM ឬសាខាធនាគារដែលនៅជិតបំផុត (ក្នុងរង្វង់ ១០ គ.ម)។\n\nឬវាយឈ្មោះខេត្ត ឧ. «/atm តាកែវ» «/atm aba សៀមរាប»។", {
    reply_markup: { keyboard: [[{ text: LOCATION_BUTTON, request_location: true }]], resize_keyboard: true, one_time_keyboard: true },
  })
}

/** A location shared in the private chat: the nearest ATMs and branches. */
export async function handleAtmLocation(chatId: number, location: { latitude: number; longitude: number }) {
  return answer(chatId, { lat: location.latitude, lng: location.longitude }, null)
}
