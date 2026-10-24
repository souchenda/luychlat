import { randomBytes } from "crypto"

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { guardRequest, readJson } from "@/lib/server/guard"
import { tokenHash } from "@/lib/server/soundbox-token"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The counter phone's feed token (founder, 24/10/2026 — Task #487): POST { device, workspace } by the signed-in SoundBox
 * page → a fresh random token for that device (only its SHA-256 is kept — soundbox_devices.native_token_hash), handed to
 * the APK's foreground service, which reads that workspace's new sales with it. DELETE { device } → revoked (the
 * SoundBox turned off). Only the person's own device in a workspace they belong to; a new token replaces the old.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const service = () => createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function caller(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const body = (await readJson(request, 1_000)) as { device?: unknown; workspace?: unknown } | null
  const device = typeof body?.device === "string" && UUID.test(body.device) ? body.device : null
  const workspace = typeof body?.workspace === "string" && UUID.test(body.workspace) ? body.workspace : null
  return { supabase, user: auth.user, device, workspace }
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "soundbox-feed-token", limit: 10, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const { supabase, user, device, workspace } = await caller(request)
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (!device || !workspace) return NextResponse.json({ ok: false }, { status: 400 })
  const { data: member } = await supabase.rpc("is_workspace_member", { ws_id: workspace })
  if (member !== true) return NextResponse.json({ ok: false }, { status: 403 })
  // The device row as the person's own (the heartbeat makes it; never another person's id).
  await supabase.rpc("soundbox_heartbeat", { p_device: device, p_workspace: workspace, p_state: { visible: true, audio_unlocked: true, live: true, platform: "Android" } })
  const token = randomBytes(24).toString("hex")
  const { data, error } = await service()
    .from("soundbox_devices")
    .update({ native_token_hash: tokenHash(token) })
    .eq("id", device)
    .eq("user_id", user.id)
    .eq("workspace_id", workspace)
    .select("id")
  if (error || !data?.length) return NextResponse.json({ ok: false }, { status: 409 })
  return NextResponse.json({ ok: true, token }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: Request) {
  const blocked = guardRequest(request, { name: "soundbox-feed-token", limit: 10, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const { user, device } = await caller(request)
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (!device) return NextResponse.json({ ok: false }, { status: 400 })
  await service().from("soundbox_devices").update({ native_token_hash: null }).eq("id", device).eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}
