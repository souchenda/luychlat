// Server only: «ប្រាប់ទូ ATM ដែលខ្វះ» — a missing ATM reported from the spot (the app's /atms, or the
// bot: location → bank → optional note), an approval card to the super admins, and their decision
// (bot_atm_review: approved → bank_atms, source 'community'). Never a guessed coordinate.
import { BANKS, directionsUrl, nearestTown, type BankCode } from "@/lib/atm"
import { TOWNS } from "@/lib/kh-towns"

import { clearAtmCache } from "./atm-sync"
import { logEvent } from "./events"
import { botDb, botKey, sendText, tg } from "./telegram-bot"

type Report = { id: string; chat_id: number | null; bank_code: BankCode; latitude: number; longitude: number; accuracy_m: number | null; note: string | null; status: string }
type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string }; text?: string } }

const bankLabel = (code: string) => BANKS.find((b) => b.code === code)?.label ?? code
const coords = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`

/** The approval card to every super admin's chat: [✅ យល់ព្រមបញ្ចូល] [❌ បដិសេធ] and the map. */
export async function sendAdminCard(reportId: string): Promise<void> {
  const db = botDb()
  const { data } = await db.rpc("bot_atm_report_get", { p_key: botKey(), p_id: reportId })
  const r = data as Report | null
  if (!r) return
  const { data: chats } = await db.rpc("bot_admin_chats", { p_key: botKey() })
  const town = nearestTown(r.latitude, r.longitude, TOWNS)
  const text = [
    "📍 សំណើបន្ថែមទូ ATM ថ្មី៖",
    `• ធនាគារ៖ ${bankLabel(r.bank_code)}`,
    `• ទីតាំង៖ ${coords(r.latitude, r.longitude)}${town ? ` (ជិត${town.km})` : ""}${r.accuracy_m ? ` · ±${r.accuracy_m} ម៉ែត្រ` : ""}`,
    `• កំណត់ចំណាំ៖ ${r.note ?? "—"}`,
  ].join("\n")
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ យល់ព្រមបញ្ចូល", callback_data: `atr:${r.id}:y` },
        { text: "❌ បដិសេធ", callback_data: `atr:${r.id}:n` },
      ],
      [{ text: "🗺️ មើលទីតាំងលើផែនទី ↗", url: `https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}` }],
    ],
  }
  let sent = 0
  for (const c of (chats as { chat_id: number }[] | null) ?? []) if ((await tg("sendMessage", { chat_id: Number(c.chat_id), text, reply_markup: keyboard, disable_web_page_preview: true })).ok) sent += 1
  logEvent(sent ? "info" : "error", "atm-report", sent ? `Missing-ATM report sent to ${sent} admin chat(s)` : "Missing-ATM report: no admin chat reached", { fold: true })
}

// ---------------------------------------------------------------------------------------------
// The bot flow (private chats): «📍 ប្រាប់ទូ ATM ដែលខ្វះ» → location → bank → note or «ផ្ញើភ្លាម».
// The step is kept in memory for 10 minutes (a restart only means starting again).
// ---------------------------------------------------------------------------------------------
type Pending = { step: "location" } | { step: "note"; bank: BankCode; lat: number; lng: number }
const pending = new Map<number, Pending & { at: number }>()
const TTL = 10 * 60_000
const current = (chatId: number) => {
  const p = pending.get(chatId)
  if (p && Date.now() - p.at < TTL) return p
  pending.delete(chatId)
  return null
}

export const REPORT_BUTTON = { text: "📍 ប្រាប់ទូ ATM ដែលខ្វះ", callback_data: "atr:start" }

export const isAtmReportCallback = (data: string | undefined) => /^at[rbs]:/.test(data ?? "")

async function submit(chatId: number, bank: BankCode, lat: number, lng: number, note: string | null) {
  pending.delete(chatId)
  const { data, error } = await botDb().rpc("bot_atm_report", { p_key: botKey(), p_chat_id: chatId, p_bank: bank, p_lat: lat, p_lng: lng, p_note: note })
  if (error) return sendText(chatId, /too_many/.test(error.message) ? "🙏 បងបានផ្ញើសំណើច្រើនហើយថ្ងៃនេះ — សូមព្យាយាមម្ដងទៀតថ្ងៃស្អែក។" : "សូមអភ័យទោស ផ្ញើសំណើមិនបានទេ ពេលនេះ។")
  await sendAdminCard(data as string)
  return sendText(chatId, `✅ អរគុណបង! សំណើទូ ATM ${bankLabel(bank)} ត្រូវបានផ្ញើទៅអ្នកគ្រប់គ្រងដើម្បីពិនិត្យ — ពេលយល់ព្រម វានឹងបង្ហាញក្នុង /atm សម្រាប់អ្នកទាំងអស់គ្នា។`)
}

/** A location shared while a report waits for it: next, the bank. False when no report is in progress. */
export async function handleReportLocation(chatId: number, lat: number, lng: number): Promise<boolean> {
  if (current(chatId)?.step !== "location") return false
  pending.delete(chatId)
  const ll = `${lat.toFixed(6)}:${lng.toFixed(6)}`
  const rows = BANKS.map((b) => ({ text: `${b.dot} ${b.label}`, callback_data: `atb:${b.code}:${ll}` }))
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🏦 ទូ ATM នេះជារបស់ធនាគារណា?",
    reply_markup: { inline_keyboard: [rows.slice(0, 3), rows.slice(3)] },
  })
  return true
}

/** A text while a report waits for its note: that note, and the report goes. False otherwise. */
export async function handleReportNote(chatId: number, text: string): Promise<boolean> {
  const p = current(chatId)
  if (p?.step !== "note" || text.startsWith("/")) return false
  await submit(chatId, p.bank, p.lat, p.lng, text.trim().slice(0, 120) || null)
  return true
}

export async function handleAtmReportCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const chatId = cb.message?.chat.id
  const data = cb.data ?? ""
  if (!chatId) return answer()

  if (data === "atr:start") {
    if (cb.message?.chat.type !== "private") return answer("សូមប្រាប់នៅក្នុងការជជែកផ្ទាល់ជាមួយបូត។", true)
    pending.set(chatId, { step: "location", at: Date.now() })
    await answer()
    return sendText(chatId, "📍 សូមឈរនៅជិតទូ ATM ដែលខ្វះ ហើយចុចប៊ូតុងខាងក្រោម ដើម្បីផ្ញើទីតាំងបច្ចុប្បន្ន។", {
      reply_markup: { keyboard: [[{ text: "📍 ផ្ញើទីតាំងទូ ATM នេះ", request_location: true }]], resize_keyboard: true, one_time_keyboard: true },
    })
  }

  // The bank picked: the note next (or send at once).
  const bank = /^at([bs]):([A-Z]+):(-?\d+\.\d+):(-?\d+\.\d+)$/.exec(data)
  if (bank) {
    const [, step, code, lat, lng] = bank
    if (!BANKS.some((b) => b.code === code)) return answer()
    await answer()
    if (step === "s") return submit(chatId, code as BankCode, Number(lat), Number(lng), null)
    pending.set(chatId, { step: "note", bank: code as BankCode, lat: Number(lat), lng: Number(lng), at: Date.now() })
    return tg("sendMessage", {
      chat_id: chatId,
      text: `✍️ សរសេរកំណត់ចំណាំខ្លី (ឧ. «ផ្សារអង្គតាសោម») ជាសារបន្ទាប់ — ឬចុច «ផ្ញើភ្លាម»។`,
      reply_markup: { inline_keyboard: [[{ text: "📨 ផ្ញើភ្លាម (គ្មានកំណត់ចំណាំ)", callback_data: `ats:${code}:${lat}:${lng}` }]] },
    })
  }

  // An admin's decision on the card.
  const review = /^atr:([0-9a-f-]{36}):([yn])$/.exec(data)
  if (!review) return answer()
  const db = botDb()
  const { data: got } = await db.rpc("bot_atm_report_get", { p_key: botKey(), p_id: review[1] })
  const r = got as Report | null
  if (!r) return answer("រកមិនឃើញសំណើនេះទេ។", true)
  const town = nearestTown(r.latitude, r.longitude, TOWNS)
  const { data: res, error } = await db.rpc("bot_atm_review", {
    p_key: botKey(),
    p_chat_id: chatId,
    p_id: r.id,
    p_approve: review[2] === "y",
    p_province: town?.en ?? null,
    p_province_km: town?.km ?? null,
  })
  if (error) {
    logEvent("error", "atm-report", `ATM review failed: ${error.message}`, { fold: true })
    return answer("មានបញ្ហា — សូមព្យាយាមម្ដងទៀត។", true)
  }
  const out = res as { status: string; was?: string; ref?: string; chat_id?: number | null }
  if (out.status === "forbidden") return answer("សម្រាប់អ្នកគ្រប់គ្រងប៉ុណ្ណោះ។", true)
  if (out.status === "done") return answer(`សំណើនេះបានសម្រេចរួចហើយ (${out.was})។`, true)
  const verdict =
    out.status === "approved" ? "✅ បានយល់ព្រម — បញ្ចូលក្នុងបញ្ជីទូ ATM រួចហើយ" : out.status === "duplicate" ? "↔️ មានក្នុងបញ្ជីរួចហើយ (ក្នុងរង្វង់ ៥០ ម៉ែត្រ)" : "❌ បានបដិសេធ"
  await answer(verdict)
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: `${cb.message?.text ?? ""}\n\n${verdict}`, disable_web_page_preview: true })
  if (out.status === "approved") {
    clearAtmCache()
    logEvent("info", "atm-report", `Community ATM approved (${r.bank_code})`)
  }
  // The person who reported it hears back.
  if (out.chat_id && out.status !== "rejected")
    await tg("sendMessage", {
      chat_id: out.chat_id,
      text:
        out.status === "approved"
          ? `🎉 ទូ ATM ${bankLabel(r.bank_code)} ដែលបងបានប្រាប់ ត្រូវបានបញ្ចូលហើយ — អរគុណដែលជួយសហគមន៍!`
          : `ℹ️ ទូ ATM ${bankLabel(r.bank_code)} ដែលបងបានប្រាប់ មានក្នុងបញ្ជីរួចហើយ — អរគុណ!`,
      reply_markup: { inline_keyboard: [[{ text: "🗺️ មើលលើផែនទី ↗", url: directionsUrl(r.latitude, r.longitude) }]] },
    })
}
