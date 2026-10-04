import { NextResponse } from "next/server"

import { isAdminCaller } from "@/lib/server/admin-auth"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { setFuelPrices } from "@/lib/server/market-sync"

/**
 * /admin › Fuel prices: the Ministry of Commerce's fuel and gas prices for a
 * 10-day cycle (the same as Telegram /setfuel). Body: { regular, super,
 * diesel, lpg?, lpg_unit, from, to } in riel. Admins only (the database checks).
 */
export const runtime = "nodejs"

const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 1000 && n <= 20000
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null)

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-setfuel", limit: 10, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const caller = await isAdminCaller(request, { minRole: "admin" })
  if (!caller) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  let b: Record<string, unknown>
  try {
    b = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  const from = day(b.from)
  const to = day(b.to)
  const lpg = b.lpg === null || b.lpg === undefined || b.lpg === "" ? null : b.lpg
  if (!ok(b.regular) || !ok(b.super) || !ok(b.diesel) || (lpg !== null && !ok(lpg)) || !from || !to || to < from) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  const input = {
    regular: Math.round(b.regular as number),
    super: Math.round(b.super as number),
    diesel: Math.round(b.diesel as number),
    lpg: lpg === null ? null : Math.round(lpg as number),
    lpg_unit: b.lpg_unit === "L" ? ("L" as const) : ("kg" as const),
    from,
    to,
  }
  const saved = await setFuelPrices(input)
  if (!saved) return NextResponse.json({ error: "save_failed" }, { status: 500 })
  const note = `${input.regular}/${input.super}/${input.diesel}${input.lpg ? `/${input.lpg}${input.lpg_unit}` : ""} · ${from}–${to}`
  logEvent("info", "setfuel", `Fuel prices set in /admin: ${note}`)
  await caller.db.rpc("admin_log_action", { p_action: "SET_FUEL_PRICES", p_note: note })
  return NextResponse.json(saved.fuel ?? null)
}
