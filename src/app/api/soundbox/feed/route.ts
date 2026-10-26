import { timingSafeEqual } from "crypto"

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { catchUpItem, feedCursor, feedItems, feedQuiet, feedSince, feedSpeed, feedVoice, inQuietSpan, type FeedRow } from "@/lib/soundbox-feed"
import { SILENCED_DURING_PRAYER, type QuietSpan } from "@/lib/soundbox"
import { guardRequest, readJson } from "@/lib/server/guard"
import { tokenHash } from "@/lib/server/soundbox-token"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * The SoundBox's native feed (founder, 24/10/2026 — Task #487): the APK's foreground service asks every few seconds —
 * GET ?d=<device>&t=<token>&since=<cursor>&speed=1.2 → { items: [{ id, amount, currency, clips }], cursor } — the new
 * sales of the device's own workspace, with their clips (lib/soundbox-feed.ts), and plays them itself: no WebView, so a
 * phone that froze the page still announces. POST { d, t, event, log } → what it did, kept with the payment like the
 * page's reports. The device token is checked against its SHA-256 (never stored as such); nothing else is answered.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const service = () => createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORIGIN = "https://app.luychlat.com"

async function deviceOf(d: string | null, t: string | null) {
  if (!d || !UUID.test(d) || !t || !/^[0-9a-f]{48}$/.test(t)) return null
  const { data } = await service().from("soundbox_devices").select("id, user_id, workspace_id, native_token_hash, quiet_spans, quiet_caught_to").eq("id", d).maybeSingle()
  const stored = data?.native_token_hash
  if (!stored) return null
  const a = Buffer.from(stored, "hex")
  const b = Buffer.from(tokenHash(t), "hex")
  return a.length === b.length && timingSafeEqual(a, b) ? (data as { id: string; user_id: string; workspace_id: string; quiet_spans: unknown; quiet_caught_to: string | null }) : null
}

/** The device's stored spans (the page sent them), anything malformed dropped. */
const spansOf = (raw: unknown): QuietSpan[] => (Array.isArray(raw) ? raw.filter((s): s is QuietSpan => Number.isFinite(s?.from) && Number.isFinite(s?.to) && s.to > s.from) : [])

export async function GET(request: Request) {
  const blocked = guardRequest(request, { name: "soundbox-feed", limit: 40, windowMs: 60_000, maxBytes: 0 })
  if (blocked) return blocked
  const url = new URL(request.url)
  // The token in a header (APK 1.10+ — Task #492: in the URL it reached the server's access log); 1.9 still sends ?t=.
  const device = await deviceOf(url.searchParams.get("d"), request.headers.get("x-soundbox-token") ?? url.searchParams.get("t"))
  if (!device) return NextResponse.json({ ok: false }, { status: 401 })
  const now = Date.now()
  const since = feedSince(url.searchParams.get("since"), now)
  const speed = feedSpeed(url.searchParams.get("speed"))
  const voice = feedVoice(url.searchParams.get("voice"))
  // Quiet during the prayer (Task #506): nothing while a span is on (the cursor stays); after it, one catch-up.
  const spans = spansOf(device.quiet_spans)
  const { quiet, catchUp } = feedQuiet(now, spans, device.quiet_caught_to ? Date.parse(device.quiet_caught_to) : null)
  if (quiet) return NextResponse.json({ ok: true, items: [], cursor: url.searchParams.get("since") ?? since }, { headers: { "Cache-Control": "no-store" } })
  const db = service()
  const { data, error } = await db
    .from("soundbox_events")
    .select("id, amount, currency, transaction_time, created_at")
    .eq("workspace_id", device.workspace_id)
    .gt("created_at", since)
    .order("created_at")
    .limit(20)
  if (error) return NextResponse.json({ ok: false }, { status: 502 })
  const rows = (data ?? []) as FeedRow[]
  const items = feedItems(rows.filter((r) => !inQuietSpan(r.created_at, spans)), now, speed, ORIGIN, voice)
  if (catchUp) {
    const { data: held } = await db
      .from("soundbox_events")
      .select("id, amount, currency, transaction_time, created_at")
      .eq("workspace_id", device.workspace_id)
      .gte("created_at", new Date(catchUp.from).toISOString())
      .lt("created_at", new Date(catchUp.to).toISOString())
      .order("created_at")
      .limit(200)
    await db.from("soundbox_devices").update({ quiet_caught_to: new Date(catchUp.to).toISOString() }).eq("id", device.id)
    const heldRows = (held ?? []) as FeedRow[]
    const item = catchUpItem(heldRows, catchUp, speed, ORIGIN, voice)
    if (item) {
      items.unshift(item)
      await db.from("soundbox_reports").insert(heldRows.map((r) => ({ event_id: r.id, user_id: device.user_id, log: `native ${SILENCED_DURING_PRAYER} → said in the catch-up`, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 200) })))
    }
  }
  return NextResponse.json({ ok: true, items, cursor: feedCursor(rows, since) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "soundbox-feed-ack", limit: 40, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const body = (await readJson(request, 1_000)) as { d?: unknown; t?: unknown; event?: unknown; log?: unknown } | null
  const device = await deviceOf(typeof body?.d === "string" ? body.d : null, request.headers.get("x-soundbox-token") ?? (typeof body?.t === "string" ? body.t : null))
  if (!device) return NextResponse.json({ ok: false }, { status: 401 })
  const event = typeof body?.event === "string" && UUID.test(body.event) ? body.event : null
  const log = typeof body?.log === "string" ? body.log.replace(/\s+/g, " ").slice(0, 500) : ""
  if (!event || !log) return NextResponse.json({ ok: false }, { status: 400 })
  // Only a sale of the device's own workspace (never another business's id).
  const db = service()
  const { data: ev } = await db.from("soundbox_events").select("id").eq("id", event).eq("workspace_id", device.workspace_id).maybeSingle()
  if (!ev) return NextResponse.json({ ok: false }, { status: 404 })
  await db.from("soundbox_reports").insert({ event_id: event, user_id: device.user_id, log: `native ${log}`, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 200) })
  return NextResponse.json({ ok: true })
}
