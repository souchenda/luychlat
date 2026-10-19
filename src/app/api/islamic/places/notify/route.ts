import { after, NextResponse } from "next/server"

import { flushPlaceSubmissions } from "@/lib/server/place-alerts"
import { guardRequest } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Called by the app right after a member suggests a place (founder, 19/10/2026): the alert goes to the approval room
 * «LCA Approval» at once instead of waiting for the dispatcher's next minute. It sends only what the database still
 * holds as pending and unsent (bot_places_to_notify claims each place once), so calling it again sends nothing twice.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "places-notify", limit: 10, windowMs: 60_000, maxBytes: 200 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  after(() => flushPlaceSubmissions())
  return NextResponse.json({ ok: true })
}
