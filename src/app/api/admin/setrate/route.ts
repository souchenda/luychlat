import { NextResponse } from "next/server"

import { isAdminCaller } from "@/lib/server/admin-auth"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { setManualRate } from "@/lib/server/market-sync"

/**
 * /admin › NBC rate: NBC's newer official USD rate when the automatic feed
 * lags (the same as Telegram /setrate). Body: { usd_khr, date: "YYYY-MM-DD" }
 * (the "As of" day) or { clear: true }. Admins only (the database checks).
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-setrate", limit: 10, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const caller = await isAdminCaller(request, { minRole: "admin" })
  if (!caller) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  let body: { clear?: boolean; usd_khr?: unknown; date?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  if (body.clear) {
    const saved = await setManualRate("clear")
    if (!saved) return NextResponse.json({ error: "save_failed" }, { status: 500 })
    logEvent("info", "setrate", "NBC rate back to the automatic source (/admin)")
    await caller.db.rpc("admin_log_action", { p_action: "CLEAR_RATE_OVERRIDE", p_note: null })
    return NextResponse.json(saved.nbc ?? null)
  }

  const usdKhr = Math.round(Number(body.usd_khr))
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && !Number.isNaN(Date.parse(`${body.date}T00:00:00Z`)) ? body.date : null
  if (!(usdKhr > 3000 && usdKhr < 6000) || !date) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const saved = await setManualRate({ usd_khr: usdKhr, date })
  if (!saved) return NextResponse.json({ error: "save_failed" }, { status: 500 })
  logEvent("info", "setrate", `NBC rate set in /admin: $1 = ${usdKhr} KHR as of ${date}`)
  await caller.db.rpc("admin_log_action", { p_action: "SET_RATE_OVERRIDE", p_note: `$1 = ${usdKhr} KHR · as of ${date}` })
  return NextResponse.json(saved.nbc ?? null)
}
