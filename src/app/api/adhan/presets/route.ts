import { randomUUID } from "crypto"

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { GLOBAL_ADHAN_BUCKET, GLOBAL_ADHAN_MAX_BYTES, GLOBAL_ADHAN_MAX_SECONDS, globalAdhanError, isGlobalAdhanPath } from "@/lib/adhan-presets"
import { cleanDuaAudio, duaStoreConfigured } from "@/lib/server/dua-audio-store"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * «ដាក់ចូលអេប ប្រើរួមគ្នាទាំងអស់» (super admin only, founder 19/10/2026): multipart { name_km, name_en, credit,
 * rights, file } → the recording cleaned (MP3, −16 LUFS, ≤ 6 min) into the public bucket «adhan-audio» and registered
 * for everyone (adhan_preset_add checks the super admin again). DELETE ?id=… takes it off for everyone.
 */
export const runtime = "nodejs"

const service = () => createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))

async function superAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  // Super admin or the «admin» staff role (content managers, founder 19/10/2026); the database checks again.
  const { data } = await supabase.rpc("is_content_manager") // content admin, admin or super admin (19/10/2026)
  return data === true ? supabase : null
}

export async function POST(request: Request) {
  // Nginx takes 10 MB a request; a larger file can still be kept on the device only.
  const blocked = guardRequest(request, { name: "adhan-preset", limit: 10, windowMs: 60_000, maxBytes: GLOBAL_ADHAN_MAX_BYTES + 64_000 })
  if (blocked) return blocked
  const supabase = await superAdmin()
  if (!supabase) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!duaStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 })

  const form = await request.formData().catch(() => null)
  const nameKm = String(form?.get("name_km") ?? "").trim().slice(0, 80)
  const nameEn = String(form?.get("name_en") ?? "").trim().slice(0, 80)
  const credit = String(form?.get("credit") ?? "").trim().slice(0, 200)
  const file = form?.get("file")
  if (globalAdhanError({ nameKm, credit, rights: form?.get("rights") === "yes" }) || !(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  const mp3 = await cleanDuaAudio(new Uint8Array(await file.arrayBuffer()), GLOBAL_ADHAN_MAX_SECONDS)
  if (!mp3) return NextResponse.json({ error: "not_audio" }, { status: 400 })
  const path = `${randomUUID()}.mp3`
  const db = service()
  const up = await db.storage.from(GLOBAL_ADHAN_BUCKET).upload(path, new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: false, cacheControl: "31536000" })
  if (up.error) {
    logEvent("error", "adhan", `Upload failed: ${up.error.message}`, { fold: true })
    return NextResponse.json({ error: "upload_failed" }, { status: 500 })
  }
  const day = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" })
  const { data, error } = await supabase.rpc("adhan_preset_add", {
    p_name_km: nameKm,
    p_name_en: nameEn || null,
    p_credit: credit,
    p_rights: `Super admin confirmed: own recording, or permission / licence to share it with every member (app upload, ${day})`,
    p_path: path,
  })
  if (error) {
    await db.storage.from(GLOBAL_ADHAN_BUCKET).remove([path])
    return NextResponse.json({ error: /super admin only/.test(error.message) ? "forbidden" : "failed" }, { status: /super admin only/.test(error.message) ? 403 : 500 })
  }
  logEvent("info", "adhan", `Global Adhan published: ${nameKm} (${Math.round(mp3.length / 1024)} KB)`)
  return NextResponse.json({ ok: true, id: data as string })
}

export async function DELETE(request: Request) {
  const blocked = guardRequest(request, { name: "adhan-preset-delete", limit: 20, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const supabase = await superAdmin()
  if (!supabase) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const { data, error } = await supabase.rpc("adhan_preset_remove", { p_id: id })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })
  if (isGlobalAdhanPath(data) && duaStoreConfigured()) await service().storage.from(GLOBAL_ADHAN_BUCKET).remove([data])
  return NextResponse.json({ ok: true })
}
