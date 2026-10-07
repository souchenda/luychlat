// Server only: the 12:00 daily tip for @LuyChlatCommunity, posted only after the
// Super Admin approves it (rules enforced in the database — see the
// daily_tips migration).
//
//   10:30–11:59  draft today's tip (unless one was prepared in Admin › Super ›
//                Daily tips), render the poster, send a private preview to each
//                super admin's linked chat:
//                  [✅ អនុម័តផ្សាយ]
//                  [✏️ កែអត្ថបទ] [🔄 ប្តូរគន្លឹះថ្មី]
//                  [❌ ផ្អាកថ្ងៃនេះ]
//                ✏️ (or replying to the preview) takes new text (first line =
//                title when there are several lines) → a new version to approve.
//   12:00–12:59  post today's tip if — and only if — it is APPROVED; otherwise
//                stay silent (the preview then says so).
//
// Buttons carry the version they were shown with: a tap on an older preview
// (after an edit here or in the app) refreshes it instead of approving.
import { TIP_BODY_MAX, TIP_TITLE_MAX, defaultTip, nextTip } from "@/lib/daily-tip"
import { appUrl } from "@/lib/server/community-bulletin"
import { logEvent } from "@/lib/server/events"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, botToken, tg } from "@/lib/server/telegram-bot"
import { tipPoster } from "@/lib/server/tip-poster"
import { supabaseUrl } from "@/lib/supabase/config"

export type DailyTip = {
  day: string
  tip_id: string | null
  title: string
  body: string
  poster_path: string | null
  status: "DRAFT" | "APPROVED" | "SKIPPED" | "POSTED"
  version: number
  /** Preview photos, plus the "send the new text" prompts (prompt: true) that a reply to also edits. */
  previews: { chat: number; msg: number; prompt?: boolean }[]
}

const PREVIEW = { from: 10 * 60 + 30, until: 12 * 60 }
const POST = { from: 12 * 60, until: 13 * 60 }
const communityChat = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** What happens at this minute of the Cambodian day. */
export function tipWindow(minutes: number): "preview" | "post" | null {
  if (minutes >= PREVIEW.from && minutes < PREVIEW.until) return "preview"
  if (minutes >= POST.from && minutes < POST.until) return "post"
  return null
}

/** The public caption (Telegram HTML), as posted at 12:00. */
export function tipCaption(t: Pick<DailyTip, "title" | "body">): string {
  return [`💡 <b>គន្លឹះថ្ងៃនេះ៖ ${esc(t.title)}</b>`, "", esc(t.body), "", "📲 កត់ត្រាចំណូល-ចំណាយជាមួយ @luychlat_bot", "", "— លុយឆ្លាត · LuyChlat"].join("\n")
}

/** The status line on the private preview. */
export function statusLine(t: Pick<DailyTip, "status" | "day">, today: string, locked: boolean): string {
  if (t.status === "POSTED") return "📢 បានចេញផ្សាយរួចហើយ។"
  if (t.status === "SKIPPED") return "❌ បានផ្អាកថ្ងៃនេះ — មិនផ្សាយទេ។"
  if (locked) return "⏰ ផុតម៉ោង ១២:០០ ហើយ ដោយមិនទាន់អនុម័ត — ថ្ងៃនេះមិនផ្សាយទេ។"
  const when = t.day === today ? "នៅម៉ោង ១២:០០ ថ្ងៃត្រង់" : `ថ្ងៃ ${kmDigits(t.day.split("-").reverse().join("/"))} ម៉ោង ១២:០០`
  if (t.status === "APPROVED") return `✅ បានអនុម័ត! នឹងចេញផ្សាយ${when}។`
  return `⏳ រង់ចាំការអនុម័ត — មិនផ្សាយទេ បើមិនទាន់អនុម័តមុនម៉ោង ១២:០០។`
}

/** The preview's caption: what will be posted, its status, and how to edit. */
export function previewCaption(t: DailyTip, today: string, locked: boolean): string {
  const head = `👀 <b>ពិនិត្យមុនផ្សាយ</b> · ${kmDigits(t.day.split("-").reverse().join("/"))} · v${t.version}`
  const editable = t.status !== "POSTED" && !locked
  return [
    head,
    "",
    tipCaption(t),
    "",
    statusLine(t, today, locked),
    ...(editable ? ["✏️ ចុច «កែអត្ថបទ» ឬ Reply សារនេះ ដើម្បីកែ (ជួរទី ១ = ចំណងជើង)។"] : []),
  ].join("\n")
}

type Button = { text: string; callback_data: string }
/** Buttons for the preview: tq:<yyyymmdd>:<version>:<a|n|s|d>. */
export function previewKeyboard(t: DailyTip, locked: boolean): Button[][] {
  if (t.status === "POSTED" || locked) return []
  const data = (action: string) => `tq:${t.day.replace(/-/g, "")}:${t.version}:${action}`
  const edit = { text: "✏️ កែអត្ថបទ", callback_data: data("e") }
  const fresh = { text: "🔄 ប្តូរគន្លឹះថ្មី", callback_data: data("n") }
  const skip = { text: "❌ ផ្អាកថ្ងៃនេះ", callback_data: data("s") }
  if (t.status === "APPROVED") return [[edit, fresh], [skip]]
  if (t.status === "SKIPPED") return [[{ text: "↩️ បើកវិញ (ពិនិត្យម្ដងទៀត)", callback_data: data("d") }]]
  return [[{ text: "✅ អនុម័តផ្សាយ", callback_data: data("a") }], [edit, fresh], [skip]]
}

/** Is today's 12:00 cut-off past for this day? */
function lockedFor(day: string) {
  const now = phnomPenhToday()
  return day < now.day || (day === now.day && now.hour >= 12)
}

/** The poster: a custom upload (public bucket), else the generated one. */
async function posterFor(t: DailyTip): Promise<Buffer> {
  if (t.poster_path && supabaseUrl) {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/public/tip-posters/${t.poster_path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null)
    if (res?.ok) return Buffer.from(await res.arrayBuffer())
    logEvent("warn", "daily-tip", `Custom poster ${t.poster_path} unavailable — using the generated one`, { fold: true })
  }
  return tipPoster(t, t.day)
}

/** sendPhoto / editMessageMedia with an uploaded PNG; returns the message id. */
async function photo(chatId: number | string, png: Buffer, caption: string, opts: { messageId?: number; reply_markup?: unknown } = {}) {
  const token = botToken()
  if (!token) return null
  const form = new FormData()
  form.append("chat_id", String(chatId))
  if (opts.messageId) {
    form.append("message_id", String(opts.messageId))
    form.append("media", JSON.stringify({ type: "photo", media: "attach://poster", caption, parse_mode: "HTML" }))
    form.append("poster", new Blob([new Uint8Array(png)], { type: "image/png" }), "poster.png")
  } else {
    form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "poster.png")
    form.append("caption", caption)
    form.append("parse_mode", "HTML")
  }
  if (opts.reply_markup) form.append("reply_markup", JSON.stringify(opts.reply_markup))
  const res = await fetch(`https://api.telegram.org/bot${token}/${opts.messageId ? "editMessageMedia" : "sendPhoto"}`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null)
  const json = (await res?.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number; reply_markup?: unknown }; description?: string } | null
  if (!json?.ok) {
    logEvent("error", "daily-tip", `Telegram ${opts.messageId ? "editMessageMedia" : "sendPhoto"} failed: ${json?.description ?? "no answer"}`, { fold: true })
    return null
  }
  const id = json.result?.message_id ?? opts.messageId ?? null
  // The buttons must be there: if Telegram's answer shows none, attach them again.
  const wanted = (opts.reply_markup as { inline_keyboard?: unknown[] } | undefined)?.inline_keyboard?.length
  if (id && wanted && !json.result?.reply_markup) {
    const fix = await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: id, reply_markup: opts.reply_markup })
    logEvent(fix.ok ? "warn" : "error", "daily-tip", fix.ok ? "Preview buttons were missing — attached again" : `Preview buttons missing and could not be attached: ${fix.description ?? ""}`, { fold: true })
  }
  return id
}

/** Redraws every preview of a day: the whole poster after a text change, else just the caption and buttons. */
async function refreshPreviews(t: DailyTip, withImage: boolean) {
  const today = phnomPenhToday().day
  const locked = lockedFor(t.day)
  const caption = previewCaption(t, today, locked)
  const reply_markup = { inline_keyboard: previewKeyboard(t, locked) }
  const png = withImage ? await posterFor(t) : null
  for (const p of (t.previews ?? []).filter((x) => !x.prompt)) {
    if (png) await photo(p.chat, png, caption, { messageId: p.msg, reply_markup })
    else await tg("editMessageCaption", { chat_id: p.chat, message_id: p.msg, caption, parse_mode: "HTML", reply_markup })
  }
}

/** Sends a fresh preview to every super admin chat (replacing the stored ones). */
async function sendPreviews(t: DailyTip) {
  const db = botDb()
  const { data: chats } = await db.rpc("bot_super_admin_chats", { p_key: botKey() })
  const today = phnomPenhToday().day
  const locked = lockedFor(t.day)
  const png = await posterFor(t)
  const previews: { chat: number; msg: number }[] = []
  for (const c of (chats as { chat_id: number }[] | null) ?? []) {
    const msg = await photo(Number(c.chat_id), png, previewCaption(t, today, locked), { reply_markup: { inline_keyboard: previewKeyboard(t, locked) } })
    if (msg) previews.push({ chat: Number(c.chat_id), msg })
  }
  await db.rpc("bot_tip_set_previews", { p_key: botKey(), p_day: t.day, p_previews: previews })
  return previews.length
}

async function claim(job: string, day: string) {
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  return data === true
}

async function getTip(day: string): Promise<DailyTip | null> {
  const { data } = await botDb().rpc("bot_tip_get", { p_key: botKey(), p_day: day })
  const t = data as DailyTip | null
  return t?.day ? t : null
}

/** Called every minute by the dispatcher. */
export async function dailyTipTick() {
  const now = phnomPenhToday()
  const phase = tipWindow(now.hour * 60 + now.minute)
  if (!phase) return
  const db = botDb()

  if (phase === "preview") {
    if (!(await claim("tip-preview", now.day))) return
    let t = await getTip(now.day)
    if (!t) {
      const tip = defaultTip(now.day)
      const { data } = await db.rpc("bot_tip_ensure", { p_key: botKey(), p_day: now.day, p_tip_id: tip.id, p_title: tip.title.km, p_body: tip.body.km })
      t = data as DailyTip | null
    }
    if (!t?.day || t.status === "POSTED") return
    const sent = await sendPreviews(t)
    logEvent(sent ? "info" : "warn", "daily-tip", sent ? `Tip preview v${t.version} sent to ${sent} super admin chat(s)` : "Tip preview: no super admin has a linked Telegram chat")
    return
  }

  // 12:00–12:59: post only an approved tip (the database claims it once).
  const chat = communityChat()
  if (!chat) return
  const { data } = await db.rpc("bot_tip_claim_post", { p_key: botKey() })
  const t = data as DailyTip | null
  if (!t?.day) {
    // Not approved: say so on the preview, once.
    const pending = await getTip(now.day)
    if (pending && pending.status !== "POSTED" && pending.status !== "APPROVED" && (await claim("tip-lock", now.day))) await refreshPreviews(pending, false)
    return
  }
  const [url, me] = await Promise.all([appUrl(), tg<{ username?: string }>("getMe", {})])
  const row = [
    ...(me.result?.username ? [{ text: "🤖 កត់ត្រាជាមួយ Bot", url: `https://t.me/${me.result.username}` }] : []),
    ...(url ? [{ text: "📱 បើកកម្មវិធី", url }] : []),
  ]
  const msg = await photo(chat, await posterFor(t), tipCaption(t), row.length ? { reply_markup: { inline_keyboard: [row] } } : {})
  if (!msg) {
    await db.rpc("bot_tip_post_failed", { p_key: botKey(), p_day: t.day })
    logEvent("error", "daily-tip", "Posting the approved tip failed — will retry next minute (until 13:00)", { fold: true })
    return
  }
  await db.rpc("bot_tip_posted", { p_key: botKey(), p_day: t.day, p_message_id: msg })
  await refreshPreviews(t, false)
  logEvent("info", "daily-tip", `Approved tip v${t.version} posted to ${chat}`)
}

export const isTipCallback = (data: string | undefined) => Boolean(data?.startsWith("tq:"))

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }

/** A preview button: approve / new tip / skip / reopen — from a super admin's chat only. */
export async function handleTipCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const m = /^tq:(\d{4})(\d{2})(\d{2}):(\d+):([ansde])$/.exec(cb.data ?? "")
  const chatId = cb.message?.chat.id
  if (!m || !chatId || cb.message?.chat.type !== "private") return answer()
  const day = `${m[1]}-${m[2]}-${m[3]}`
  const version = Number(m[4])
  const action = m[5]
  const current = await getTip(day)
  if (!current) return answer("រកមិនឃើញគន្លឹះនេះទេ។", true)
  if (action === "e") return askForText(chatId, current, cb.message!.message_id, answer)
  // An older preview (edited since, here or in the app): show the current version instead.
  if (current.version !== version && action !== "d") {
    await refreshPreviews(current, true)
    return answer("បានកែប្រែរួច — សូមពិនិត្យកំណែថ្មី ហើយអនុម័តម្ដងទៀត។", true)
  }
  const params =
    action === "n"
      ? (() => {
          const tip = nextTip(current.tip_id)
          return { p_action: "save", p_title: tip.title.km, p_body: tip.body.km, p_tip_id: tip.id }
        })()
      : { p_action: action === "a" ? "approve" : action === "s" ? "skip" : "draft", p_version: version }
  const { data, error } = await botDb().rpc("bot_tip_action", { p_key: botKey(), p_chat_id: chatId, p_day: day, ...params })
  if (error) {
    const msg = error.message ?? ""
    const why = /super admin only/.test(msg)
      ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។"
      : /too_late/.test(msg)
        ? "ផុតម៉ោង ១២:០០ ហើយ — ថ្ងៃនេះមិនផ្សាយទេ។"
        : /already_posted/.test(msg)
          ? "បានចេញផ្សាយរួចហើយ។"
          : /stale_version/.test(msg)
            ? "បានកែប្រែរួច — សូមពិនិត្យកំណែថ្មី។"
            : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។"
    await answer(why, true)
    await refreshPreviews(current, false)
    return
  }
  const t = data as DailyTip
  await answer(action === "a" ? "✅ បានអនុម័ត" : action === "n" ? "🔄 គន្លឹះថ្មី" : action === "s" ? "❌ បានផ្អាក" : "↩️ បើកវិញ")
  await refreshPreviews(t, action === "n")
}

/** ✏️ កែអត្ថបទ: a prompt to reply to with the new text; the reply edits the tip (handleTipReply). */
async function askForText(chatId: number, t: DailyTip, previewMsg: number, answer: (text?: string, alert?: boolean) => unknown) {
  if (t.status === "POSTED" || lockedFor(t.day)) return answer("ផុតម៉ោងកែហើយ។", true)
  const sent = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: [
      "✏️ សូម Reply សារនេះដោយអត្ថបទថ្មី៖",
      "• ច្រើនជួរ៖ ជួរទី ១ = ចំណងជើង, ជួរបន្ទាប់ = ការពន្យល់",
      "• មួយជួរ៖ ប្តូរតែការពន្យល់",
      "",
      `ចំណងជើងបច្ចុប្បន្ន៖ ${t.title}`,
    ].join("\n"),
    reply_to_message_id: previewMsg,
    reply_markup: { force_reply: true, input_field_placeholder: t.title.slice(0, 60) },
  })
  if (!sent.ok || !sent.result) return answer("មិនអាចផ្ញើបានទេ។", true)
  await botDb().rpc("bot_tip_set_previews", { p_key: botKey(), p_day: t.day, p_previews: [...(t.previews ?? []), { chat: chatId, msg: sent.result.message_id, prompt: true }] })
  return answer()
}

/**
 * A reply to a preview from a super admin: the new text (several lines → the
 * first is the title, the rest the explanation; one line → the explanation).
 * Returns false when the message isn't a reply to a tip preview.
 */
export async function handleTipReply(chatId: number, replyTo: number, text: string): Promise<boolean> {
  const db = botDb()
  const { data: day } = await db.rpc("bot_tip_by_preview", { p_key: botKey(), p_chat_id: chatId, p_message_id: replyTo })
  if (typeof day !== "string") return false
  const current = await getTip(day)
  if (!current) return false
  const lines = text.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const title = (lines.length > 1 ? lines[0] : current.title).slice(0, TIP_TITLE_MAX)
  const body = (lines.length > 1 ? lines.slice(1).join("\n") : lines[0] ?? "").slice(0, TIP_BODY_MAX)
  if (!body) return true
  const { data, error } = await db.rpc("bot_tip_action", { p_key: botKey(), p_chat_id: chatId, p_day: day, p_action: "save", p_title: title, p_body: body })
  if (error) {
    await tg("sendMessage", { chat_id: chatId, text: /already_posted/.test(error.message) ? "បានចេញផ្សាយរួចហើយ — មិនអាចកែបានទេ។" : /super admin/.test(error.message) ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។", reply_to_message_id: replyTo })
    return true
  }
  await refreshPreviews(data as DailyTip, true)
  await tg("sendMessage", { chat_id: chatId, text: "✏️ បានកែ (កំណែថ្មី) — សូមពិនិត្យ ហើយចុច «✅ អនុម័តផ្សាយ» ម្ដងទៀត។", reply_to_message_id: replyTo })
  return true
}
