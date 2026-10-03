import { NextResponse } from "next/server"

import { plausible, type BuySell } from "@/lib/local-gold"
import { isAdminCaller } from "@/lib/server/admin-auth"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { currentMarket, setManualGold } from "@/lib/server/market-sync"

/**
 * /admin › Gold prices: today's Phnom Penh counter prices, the same daily
 * override as Telegram /setgold. Body: { kilo: {sell, buy}, jewelry?: {sell, buy} }
 * or { clear: true } to go back to CSNJ. Admins only (the database checks).
 */
export const runtime = "nodejs"

const pair = (v: unknown): BuySell | null => {
  const p = v as { sell?: unknown; buy?: unknown } | null
  const sell = Number(p?.sell)
  const buy = Number(p?.buy)
  return Number.isFinite(sell) && Number.isFinite(buy) && sell > 0 && buy > 0 ? { sell, buy } : null
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-setgold", limit: 10, windowMs: 60_000, maxBytes: 2_000 })
  if (blocked) return blocked
  const caller = await isAdminCaller(request)
  if (!caller) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  let body: { clear?: boolean; kilo?: unknown; jewelry?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  if (body.clear) {
    const saved = await setManualGold("clear")
    if (!saved) return NextResponse.json({ error: "save_failed" }, { status: 500 })
    logEvent("info", "setgold", "Gold prices back to CSNJ (/admin)")
    await caller.db.rpc("admin_log_action", { p_action: "CLEAR_GOLD_OVERRIDE", p_note: null })
    return NextResponse.json(saved.local_gold ?? null)
  }

  const kilo = pair(body.kilo)
  const jewelry = body.jewelry ? pair(body.jewelry) : null
  if (!kilo || (body.jewelry && !jewelry)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const reference = (await currentMarket())?.gold?.reference.GOLD_24K
  if (!plausible({ kilo, jewelry }, reference)) return NextResponse.json({ error: "implausible" }, { status: 422 })

  const saved = await setManualGold({ kilo, jewelry })
  if (!saved) return NextResponse.json({ error: "save_failed" }, { status: 500 })
  logEvent("info", "setgold", `Gold prices set in /admin: kilo ${kilo.sell}/${kilo.buy}${jewelry ? `, jewelry ${jewelry.sell}/${jewelry.buy}` : ""}`)
  await caller.db.rpc("admin_log_action", { p_action: "SET_GOLD_OVERRIDE", p_note: `kilo ${kilo.sell}/${kilo.buy}${jewelry ? ` · jewelry ${jewelry.sell}/${jewelry.buy}` : ""}` })
  return NextResponse.json(saved.local_gold ?? null)
}
