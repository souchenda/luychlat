// Server only: a member's qasidah reaches the founder's chat as audio with [ ✅ អនុម័ត ] [ ❌ បដិសេធ ]
// (lib/nasheed.ts). ✅ copies the file from the private bucket into the public one and the track goes live;
// ❌ rejects it and deletes the file. Who may tap is checked in the database (bot_nasheed_review → super admin).
import { createClient } from "@supabase/supabase-js"

import { contentTypeOf, parseNasheedCallback, reviewButtons, reviewCaption, SUBMISSIONS_BUCKET, type ReviewState } from "@/lib/nasheed"
import { marketingChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, botToken, tg } from "@/lib/server/telegram-bot"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"

const PUBLIC_BUCKET = "nasheed-audio"
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
export const reviewConfigured = () => Boolean(serviceKey() && supabaseUrl && botToken())
const service = () => createClient(supabaseUrl, serviceKey()!, withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))

type Row = { id: string; title_km: string; artist: string; audio_path: string | null; status: ReviewState; submitted_by: string | null; notified: boolean }

async function submitterName(db: ReturnType<typeof service>, userId: string | null) {
  if (!userId) return "—"
  const { data } = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle()
  return (data as { display_name?: string } | null)?.display_name ?? "—"
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
  const caption = reviewCaption({ title: row.title_km, artist: row.artist, submitter: await submitterName(db, row.submitted_by), state: "PENDING" })
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
    const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendAudio`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(60_000) })
      .then((r) => r.json() as Promise<{ ok: boolean; description?: string }>)
      .catch(() => ({ ok: false, description: "network" }))
    if (res.ok) sent = true
    else logEvent("error", "nasheed", `sendAudio failed: ${res.description ?? "?"}`, { fold: true })
  }
  if (sent) await db.from("nasheed_tracks").update({ notified: true }).eq("id", id)
  return sent
}

type Callback = { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } }

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
  const state: ReviewState = parsed.approve ? "APPROVED" : "REJECTED"
  await tg("editMessageCaption", {
    chat_id: chat.id,
    message_id: cb.message!.message_id,
    caption: reviewCaption({ title: row.title_km, artist: row.artist, submitter: await submitterName(db, row.submitted_by), state }),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  })
}
