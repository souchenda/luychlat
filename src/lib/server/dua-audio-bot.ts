// Server only: the super admin sets a du'a's recording from @luychlat_bot (founder, 19/10/2026), either way round:
//   • /setdua → [ ពេលភ្ញាក់ពីដំណេក ] [ ពេលចេញពីផ្ទះ ] … → tap one → send the audio or a voice note;
//   • send an audio file → the same nine buttons → tap one.
// What is waiting lives here for 10 minutes (one active container answers the webhook). Only a super admin's linked
// private chat can set one; the database checks it again (bot_dua_recording_set). Voice notes from anyone else, or
// with nothing waiting, go on to the usual voice logging untouched.
import { DUAS } from "@/lib/duas"
import { duaPickButtons, isDuaId, parseDuaCallback } from "@/lib/dua-audio"
import { saveDuaRecording } from "@/lib/server/dua-audio-store"
import { botDb, botKey, botToken, sendText, tg } from "@/lib/server/telegram-bot"

const TTL_MS = 10 * 60_000
type Waiting = { dua?: string; fileId?: string; credit?: string; at: number }
const waiting = new Map<number, Waiting>()

const fresh = (chatId: number) => {
  const w = waiting.get(chatId)
  if (w && Date.now() - w.at > TTL_MS) waiting.delete(chatId)
  return waiting.get(chatId) ?? null
}

async function isSuperAdminChat(chatId: number) {
  const { data } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
  return ((data as (number | string)[] | null) ?? []).map(Number).includes(chatId)
}

const titleOf = (id: string) => DUAS.find((d) => d.id === id)?.title.km ?? id
const PICK_TEXT =
  "📤 បញ្ចូលសំឡេងឌុអា\nសូមជ្រើសរើសឌុអាខាងក្រោម។\n\nដោយបញ្ចូល អ្នកបញ្ជាក់ថា សំឡេងនេះត្រូវនឹងអក្សរអារ៉ាប់លើកាតក្នុង អេប លុយឆ្លាត ហើយជាសំឡេងរបស់អ្នកសូត្រផ្ទាល់ ឬមានការអនុញ្ញាតជាលាយលក្ខណ៍អក្សរ។"
const askAudio = (id: string) =>
  `🎙 សូមផ្ញើសំឡេង «${titleOf(id)}» ឥឡូវនេះ (MP3 / M4A ឬសារជាសំឡេង) — ក្នុងរយៈពេល ១០ នាទី។\nសរសេរឈ្មោះអ្នកសូត្រក្នុង caption (ឧ. «អ៊ីម៉ាម … វិហារ …»)។`

/** /setdua [id] in a private chat. */
export async function handleSetDua(chatId: number, payload?: string) {
  if (!(await isSuperAdminChat(chatId))) return void (await sendText(chatId, "🔒 សម្រាប់ Super Admin ប៉ុណ្ណោះ។"))
  if (payload && isDuaId(payload)) {
    waiting.set(chatId, { dua: payload, at: Date.now() })
    return void (await sendText(chatId, askAudio(payload)))
  }
  waiting.delete(chatId)
  await sendText(chatId, PICK_TEXT, { reply_markup: { inline_keyboard: duaPickButtons() } })
}

/** «audio»: an audio file (offered the nine du'as); a voice note or an audio document only when a du'a is waiting. */
export type DuaIncoming = { fileId: string; kind: "voice" | "audio" | "document"; caption?: string; size?: number }

/** Should this audio go to the du'a flow (decided at once, before Telegram is answered)? */
export const duaWantsAudio = (chatId: number, kind: DuaIncoming["kind"]) => Boolean(fresh(chatId)?.dua) || kind === "audio"

/**
 * An audio file or voice note in a private chat. True when it was handled here: saved for the du'a waiting for it,
 * or (an audio file from a super admin) held while the du'a is picked.
 */
export async function handleDuaAudio(chatId: number, file: DuaIncoming): Promise<boolean> {
  const w = fresh(chatId)
  const credit = file.caption?.trim().slice(0, 200) || undefined
  if (w?.dua) {
    waiting.delete(chatId)
    await store(chatId, w.dua, file.fileId, credit)
    return true
  }
  if (file.kind !== "audio" || !(await isSuperAdminChat(chatId))) return false
  waiting.set(chatId, { fileId: file.fileId, credit, at: Date.now() })
  await sendText(chatId, PICK_TEXT, { reply_markup: { inline_keyboard: duaPickButtons() } })
  return true
}

type Callback = { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } }

/** A tap on one of the nine du'as. */
export async function handleDuaCallback(cb: Callback) {
  const dua = parseDuaCallback(cb.data)
  const chat = cb.message?.chat
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert })
  if (!dua || !chat || chat.type !== "private") return void (await answer(""))
  if (!(await isSuperAdminChat(chat.id))) return void (await answer("សម្រាប់ Super Admin ប៉ុណ្ណោះ។", true))
  await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message!.message_id, reply_markup: { inline_keyboard: [] } })
  const w = fresh(chat.id)
  if (w?.fileId) {
    waiting.delete(chat.id)
    await answer(`⏳ ${titleOf(dua)}`)
    await store(chat.id, dua, w.fileId, w.credit)
    return
  }
  waiting.set(chat.id, { dua, at: Date.now() })
  await answer(titleOf(dua))
  await sendText(chat.id, askAudio(dua))
}

/** Telegram's copy of the file (bots may fetch up to 20 MB). */
async function download(fileId: string): Promise<Uint8Array | null> {
  const token = botToken()
  if (!token || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return null
  const info = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId })
  const path = info.result?.file_path
  if (!info.ok || !path || (info.result?.file_size ?? 0) > 20 * 1024 * 1024) return null
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) })
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  } catch {
    return null
  }
}

async function store(chatId: number, dua: string, fileId: string, credit: string | undefined) {
  const bytes = await download(fileId)
  if (!bytes) return void (await sendText(chatId, "⚠️ មិនអាចទាញយកឯកសារពី Telegram បានទេ (ធំជាង 20 MB?)។ សូមសាកម្ដងទៀត /setdua"))
  const day = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" })
  const rights = `Super admin confirmed in Telegram: the reciter's own recording or written permission, matching the card's text (${day})`
  const who = credit ?? "Super Admin (Telegram)"
  const result = await saveDuaRecording(dua, bytes, async (path) => {
    const { data, error } = await botDb().rpc("bot_dua_recording_set", { p_key: botKey(), p_chat_id: chatId, p_dua: dua, p_path: path, p_credit: who, p_rights: rights })
    return { old: (data as string | null) ?? null, error: error?.message ?? null }
  })
  if (result.ok) await sendText(chatId, `✅ បានរក្សាទុកសំឡេង «${titleOf(dua)}» — ប៊ូតុង 🔊 និង «🔁 ទន្ទេញ» បើកសម្រាប់អ្នកប្រើទាំងអស់ហើយ។\n🎙 ${who}\n\nhttps://app.luychlat.com/islamic/duas`)
  else
    await sendText(
      chatId,
      result.error === "not_audio"
        ? "⚠️ មិនអាចអានសំឡេងនេះបានទេ។ សូមផ្ញើជា MP3, M4A ឬសារជាសំឡេង។"
        : result.error === "forbidden"
          ? "🔒 សម្រាប់ Super Admin ប៉ុណ្ណោះ។"
          : result.error === "not_configured"
            ? "⚠️ មិនទាន់កំណត់រចនាសម្ព័ន្ធ (service key) ទេ។"
            : "⚠️ រក្សាទុកមិនបានទេ។ សូមសាកម្ដងទៀត /setdua",
    )
}
