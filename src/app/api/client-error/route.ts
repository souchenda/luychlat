import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest, readJson } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * A save that failed on the phone (it talks to the database directly, so the
 * server never sees why): the database's error text goes to the admin event
 * log. Signed-in users only, a few per minute; never any statement content —
 * the client sends only the error code / message and counts.
 */
const SOURCES = new Set(["reconcile", "nssf-crop"])

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "client-error", limit: 6, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 })
  const body = (await readJson(request, 2_000)) as { source?: unknown; message?: unknown } | null
  const source = typeof body?.source === "string" && SOURCES.has(body.source) ? body.source : null
  const message = typeof body?.message === "string" ? body.message.replace(/\s+/g, " ").trim().slice(0, 400) : ""
  if (!source || !message) return NextResponse.json({ ok: false }, { status: 400 })
  logEvent("error", source, `Save failed on a phone (user …${auth.user.id.slice(-4)}): ${message}`)
  return NextResponse.json({ ok: true })
}
