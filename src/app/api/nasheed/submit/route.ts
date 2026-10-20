import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { notifySubmission } from "@/lib/server/nasheed-review"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * «📤 ចែករំលែកបទកសាដះ»: the file is already in the member's own folder of the private bucket; this records the
 * PENDING track (nasheed_submit checks the confirmation, the path and the file) and sends it to the founder's
 * Telegram with ✅ / ❌. Nobody else sees it until it is approved.
 */
export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "nasheed-submit", limit: 5, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { title?: unknown; artist?: unknown; path?: unknown; authentic?: unknown } | null
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "")
  const { data, error } = await supabase.rpc("nasheed_submit", {
    p_title: str(body?.title),
    p_artist: str(body?.artist),
    p_path: typeof body?.path === "string" ? body.path : "",
    p_authentic: body?.authentic === true,
    // The rights confirmation was dropped (founder, 20/10/2026 — members share recordings they found to listen to,
    // non-commercially, under notice & take-down); the database no longer requires it.
    p_rights: null,
  })
  if (error) {
    const tooMany = /too many pending/.test(error.message)
    return NextResponse.json({ error: tooMany ? "too_many" : "invalid" }, { status: tooMany ? 429 : 400 })
  }
  const id = (data as { id?: string } | null)?.id
  if (id) {
    try {
      if (!(await notifySubmission(id))) logEvent("warn", "nasheed", `Submission ${id} recorded; the founder's alert was not sent`, { fold: true })
    } catch (e) {
      logEvent("error", "nasheed", `Submission alert failed: ${(e as Error).message}`, { fold: true })
    }
  }
  return NextResponse.json({ ok: true })
}
