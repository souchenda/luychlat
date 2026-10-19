import { NextResponse } from "next/server"

import { DUA_UPLOAD_MAX_BYTES, isDuaId } from "@/lib/dua-audio"
import { deleteDuaFile, saveDuaRecording } from "@/lib/server/dua-audio-store"
import { guardRequest } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * «📤 បញ្ចូលសំឡេង» on a du'a card (super admin only, founder 19/10/2026): multipart { dua, credit, rights, file }.
 * The server cleans the recording into the public bucket; dua_recording_set records it as the signed-in caller (the
 * database refuses anyone but a super admin). DELETE ?dua=… takes a recording off.
 */
export const runtime = "nodejs"

async function superAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  // Super admin or the «admin» staff role (content managers, founder 19/10/2026); the database checks again.
  const { data } = await supabase.rpc("is_content_manager") // content admin, admin or super admin (19/10/2026)
  return data === true ? supabase : null
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "dua-audio", limit: 20, windowMs: 60_000, maxBytes: DUA_UPLOAD_MAX_BYTES + 64_000 })
  if (blocked) return blocked
  const supabase = await superAdmin()
  if (!supabase) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const dua = form?.get("dua")
  const credit = String(form?.get("credit") ?? "").trim().slice(0, 200)
  const file = form?.get("file")
  if (!isDuaId(dua) || credit.length < 2 || form?.get("rights") !== "yes" || !(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  if (file.size > DUA_UPLOAD_MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 })

  const day = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" })
  const rights = `Super admin confirmed: the reciter's own recording or written permission, matching the card's text (app upload, ${day})`
  const result = await saveDuaRecording(dua, new Uint8Array(await file.arrayBuffer()), async (path) => {
    const { data, error } = await supabase.rpc("dua_recording_set", { p_dua: dua, p_path: path, p_credit: credit, p_rights: rights })
    return { old: (data as string | null) ?? null, error: error?.message ?? null }
  })
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_audio" || result.error === "bad_dua" ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, path: result.path })
}

export async function DELETE(request: Request) {
  const blocked = guardRequest(request, { name: "dua-audio-delete", limit: 20, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const supabase = await superAdmin()
  if (!supabase) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const dua = new URL(request.url).searchParams.get("dua")
  if (!isDuaId(dua)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const { data, error } = await supabase.rpc("dua_recording_remove", { p_dua: dua })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })
  await deleteDuaFile(dua, (data as string | null) ?? null)
  return NextResponse.json({ ok: true })
}
