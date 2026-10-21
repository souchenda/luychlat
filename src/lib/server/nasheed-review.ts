// Server only: a member's qasidah reaches the founder's chat as audio with [ ✅ អនុម័ត ] [ ❌ បដិសេធ ]
// (lib/nasheed.ts). ✅ copies the file from the private bucket into the public one and the track goes live;
// ❌ rejects it and deletes the file. Who may tap is checked in the database (bot_nasheed_review → super admin).
import { createClient } from "@supabase/supabase-js"
import { outgoingForm } from "@/lib/server/numerals"

import { contentTypeOf, demotedNotice, demotedReport, NASHEED_PUBLIC_CAP, overflowReport, parseNasheedCallback, reviewButtons, reviewCaption, submittedThanksNasheed, SUBMISSIONS_BUCKET, type ReviewState } from "@/lib/nasheed"
import { kmClock } from "@/lib/scheduled-posts"
import { communityBadge } from "@/lib/contributor-thanks"
import { founderChats, marketingChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { thankContributor } from "@/lib/server/place-alerts"
import { botDb, botKey, botToken, tg } from "@/lib/server/telegram-bot"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"

const PUBLIC_BUCKET = "nasheed-audio"
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
export const reviewConfigured = () => Boolean(serviceKey() && supabaseUrl && botToken())
const service = () => createClient(supabaseUrl, serviceKey()!, withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))

type Row = { id: string; title_km: string; artist: string; audio_path: string | null; status: ReviewState; submitted_by: string | null; notified: boolean }

/** The submitter's community for the card's badge (Islamic Mode on or off). */
async function submitterBadge(db: ReturnType<typeof service>, userId: string | null) {
  if (!userId) return undefined
  const { data } = await db.from("islamic_settings").select("enabled").eq("user_id", userId).maybeSingle()
  return communityBadge(Boolean((data as { enabled?: boolean } | null)?.enabled))
}

type Contact = { name: string; contact: string | null; chat_id: number | null }
/** The submitter's name, phone or Telegram @, and their chat (bot_member_contact). */
async function submitterContact(userId: string | null): Promise<Contact> {
  if (!userId) return { name: "—", contact: null, chat_id: null }
  const { data } = await botDb().rpc("bot_member_contact", { p_key: botKey(), p_user: userId })
  const c = (data as Partial<Contact> | null) ?? {}
  return { name: c.name ?? "—", contact: c.contact ?? null, chat_id: c.chat_id ? Number(c.chat_id) : null }
}

/** The thank-you right after a public submission, in the submitter's private Telegram chat when linked (founder, 20/10/2026). */
async function thankSubmitterNow(title: string, contact: Contact) {
  if (!contact.chat_id) return
  const res = await tg("sendMessage", { chat_id: contact.chat_id, text: submittedThanksNasheed(title, true, contact.name), parse_mode: "HTML", disable_web_page_preview: true })
  logEvent(res.ok ? "info" : "warn", "nasheed", res.ok ? "Submission thanks sent on Telegram" : `Submission thanks not delivered: ${res.description ?? "?"}`, { fold: !res.ok })
}

/** Sends a new submission to the founder (once). False when it could not be sent; the track stays PENDING. */
export async function notifySubmission(id: string): Promise<boolean> {
  if (!reviewConfigured()) return false
  const db = service()
  const { data } = await db.from("nasheed_tracks").select("id, title_km, artist, audio_path, status, submitted_by, notified").eq("id", id).maybeSingle()
  const row = data as Row | null
  if (!row || row.status !== "PENDING" || row.notified || !row.audio_path?.startsWith("sub:")) return false
  const path = row.audio_path.slice(4)
  const file = await db.storage.from(SUBMISSIONS_BUCKET).download(path)
  if (file.error || !file.data) {
    logEvent("error", "nasheed", `Submission ${id}: file not readable`, { fold: true })
    return false
  }
  const bytes = new Uint8Array(await file.data.arrayBuffer())
  const ext = path.split(".").pop() ?? "mp3"
  const who = await submitterContact(row.submitted_by)
  await thankSubmitterNow(row.title_km, who)
  const caption = reviewCaption({ title: row.title_km, artist: row.artist, submitter: who.name, contact: who.contact, state: "PENDING", badge: await submitterBadge(db, row.submitted_by) })
  let sent = false
  for (const chat of await marketingChats()) {
    const form = new FormData()
    form.append("chat_id", String(chat))
    form.append("audio", new Blob([bytes], { type: contentTypeOf(ext) }), `qasidah.${ext}`)
    form.append("title", row.title_km.slice(0, 64))
    form.append("performer", row.artist.slice(0, 64))
    form.append("caption", caption)
    form.append("parse_mode", "HTML")
    form.append("reply_markup", JSON.stringify({ inline_keyboard: reviewButtons(row.id) }))
    const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendAudio`, { method: "POST", body: outgoingForm(form), cache: "no-store", signal: AbortSignal.timeout(60_000) })
      .then((r) => r.json() as Promise<{ ok: boolean; description?: string }>)
      .catch(() => ({ ok: false, description: "network" }))
    if (res.ok) sent = true
    else logEvent("error", "nasheed", `sendAudio failed: ${res.description ?? "?"}`, { fold: true })
  }
  if (sent) await db.from("nasheed_tracks").update({ notified: true }).eq("id", id)
  return sent
}

type Callback = { id: string; data?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string }; message?: { message_id: number; chat: { id: number; type: string } } }

const answer = (id: string, text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert })

/** [ ✅ អនុម័ត ] / [ ❌ បដិសេធ ] */
export async function handleNasheedCallback(cb: Callback) {
  const parsed = parseNasheedCallback(cb.data)
  const chat = cb.message?.chat
  const actor = chat?.type === "private" ? chat.id : cb.from?.id
  if (!parsed || !chat || !actor) return answer(cb.id, "")
  if (!reviewConfigured()) return answer(cb.id, "មិនទាន់កំណត់រចនាសម្ព័ន្ធ (service key) ទេ។", true)
  const db = service()
  const { data } = await db.from("nasheed_tracks").select("id, title_km, artist, audio_path, status, submitted_by, notified").eq("id", parsed.id).maybeSingle()
  const row = data as Row | null
  if (!row) return answer(cb.id, "រកមិនឃើញបទនេះទេ។", true)
  if (row.status !== "PENDING") return answer(cb.id, row.status === "APPROVED" ? "✅ បានអនុម័តរួចហើយ។" : "❌ បានបដិសេធរួចហើយ។", true)
  const privatePath = row.audio_path?.startsWith("sub:") ? row.audio_path.slice(4) : null
  if (!privatePath) return answer(cb.id, "រកមិនឃើញឯកសារទេ។", true)

  let publicPath: string | null = null
  if (parsed.approve) {
    const ext = privatePath.split(".").pop() ?? "mp3"
    publicPath = `community/${row.id}.${ext}`
    const file = await db.storage.from(SUBMISSIONS_BUCKET).download(privatePath)
    if (file.error || !file.data) return answer(cb.id, "មិនអាចអានឯកសារបានទេ។ សូមសាកម្ដងទៀត។", true)
    const up = await db.storage.from(PUBLIC_BUCKET).upload(publicPath, file.data, { contentType: contentTypeOf(ext), upsert: true })
    if (up.error) return answer(cb.id, "មិនអាចផ្សាយឯកសារបានទេ។ សូមសាកម្ដងទៀត។", true)
  }

  const { data: reviewed, error } = await botDb().rpc("bot_nasheed_review", { p_key: botKey(), p_id: row.id, p_approve: parsed.approve, p_chat_id: actor, p_public_path: publicPath })
  if (error || !(reviewed as Row | null)?.id) {
    if (publicPath) await db.storage.from(PUBLIC_BUCKET).remove([publicPath])
    return answer(cb.id, error && /super admin only/.test(error.message) ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។" : "បទនេះត្រូវបានពិនិត្យរួចហើយ។", true)
  }
  // The private copy is no longer needed either way.
  await db.storage.from(SUBMISSIONS_BUCKET).remove([privatePath])
  await answer(cb.id, parsed.approve ? "✅ បានអនុម័ត — ផ្សាយហើយ" : "❌ បានបដិសេធ")
  // The member's thanks, in their community's words (bell + Telegram).
  if (parsed.approve) await thankContributor("qasidah", row.id).catch(() => {})
  // At most 30 public tracks: the least-played member track past its first week moves to its submitter's own tracks.
  if (parsed.approve) await enforceNasheedCapacity().catch((e) => logEvent("error", "nasheed", `Capacity check failed: ${(e as Error).message}`, { fold: true }))
  const state: ReviewState = parsed.approve ? "APPROVED" : "REJECTED"
  await tg("editMessageCaption", {
    chat_id: chat.id,
    message_id: cb.message!.message_id,
    caption: reviewCaption({
      title: row.title_km,
      artist: row.artist,
      ...(await submitterContact(row.submitted_by).then((c) => ({ submitter: c.name, contact: c.contact }))),
      state,
      badge: await submitterBadge(db, row.submitted_by),
      // Who decided and when (founder, 20/10/2026).
      decidedBy: [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ").trim() || (cb.from?.username ? `@${cb.from.username}` : null),
      decidedAt: kmClock(new Date().toISOString()),
    }),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  })
}

/**
 * The community library holds at most 30 public tracks (founder, 20/10/2026). Over it, the least-played member track
 * approved more than 7 days ago is moved — never deleted — into its submitter's «បទផ្ទាល់ខ្លួន»: its file is copied
 * back into their own private folder, the public copy removed, the submitter thanked (bell + Telegram) and the founder
 * told. Nothing movable (every member track in its first week): the founder is told, nothing is moved.
 */
export async function enforceNasheedCapacity(): Promise<number> {
  if (!reviewConfigured()) return 0
  const db = service()
  let moved = 0
  for (let guard = 0; guard < 5; guard++) {
    const { data, error } = await botDb().rpc("bot_nasheed_overflow", { p_key: botKey(), p_cap: NASHEED_PUBLIC_CAP })
    if (error) throw new Error(error.message)
    const r = data as { total: number; track: { id: string; title_km: string; audio_path: string; submitted_by: string; play_count: number } | null } | null
    if (!r || r.total <= NASHEED_PUBLIC_CAP) break
    if (!r.track) {
      for (const chat of await founderChats()) await tg("sendMessage", { chat_id: chat, text: overflowReport(r.total), parse_mode: "HTML" })
      break
    }
    const t = r.track
    const ext = t.audio_path.split(".").pop() ?? "mp3"
    const ownPath = `${t.submitted_by}/${crypto.randomUUID()}.${ext}`
    const file = await db.storage.from(PUBLIC_BUCKET).download(t.audio_path)
    if (file.error || !file.data) throw new Error(`public file not readable: ${t.audio_path}`)
    const up = await db.storage.from(SUBMISSIONS_BUCKET).upload(ownPath, file.data, { contentType: contentTypeOf(ext), upsert: false })
    if (up.error) throw new Error(`private copy failed: ${up.error.message}`)
    // One to one: the submitter by name (founder, 20/10/2026).
    const note = demotedNotice(t.title_km, (await submitterContact(t.submitted_by)).name)
    const { data: done, error: demoteError } = await botDb().rpc("bot_nasheed_demote", { p_key: botKey(), p_id: t.id, p_own_path: ownPath, p_title: note.title, p_message: note.plain })
    const d = done as { chat_id: number | null; title: string; play_count: number } | null
    if (demoteError || !d) {
      await db.storage.from(SUBMISSIONS_BUCKET).remove([ownPath])
      throw new Error(`demote refused: ${demoteError?.message ?? "already moved"}`)
    }
    await db.storage.from(PUBLIC_BUCKET).remove([t.audio_path])
    moved++
    if (d.chat_id) await tg("sendMessage", { chat_id: d.chat_id, text: note.html, parse_mode: "HTML", disable_web_page_preview: true })
    let told = 0
    for (const chat of await founderChats()) if ((await tg("sendMessage", { chat_id: chat, text: demotedReport(d.title, d.play_count), parse_mode: "HTML" })).ok) told++
    logEvent("info", "nasheed", `«${d.title}» (${d.play_count} plays) moved to its submitter's own tracks · founder told in ${told} chat(s)`)
  }
  return moved
}
