import { NextResponse } from "next/server"

import { khqrWithAmount } from "@/lib/khqr"
import { guardRequest } from "@/lib/server/guard"
import { botDb, botKey } from "@/lib/server/telegram-bot"

/**
 * The customer's order page data (founder, 4/11/2026): by the order's secret token only — its own order, never another,
 * never the shop's books — and the shop's KHQR with this order's amount (lib/khqr.ts khqrWithAmount) while it is unpaid.
 */
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const blocked = guardRequest(request, { name: "order-status", limit: 40, windowMs: 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const { token } = await params
  if (!/^[0-9a-f]{32}$/.test(token)) return NextResponse.json({ status: "gone" }, { status: 404 })
  const { data, error } = await botDb().rpc("order_public_status", { p_key: botKey(), p_token: token })
  const r = data as { status: string; order?: { total: number | string; state: string }; khqr?: string | null } | null
  if (error || !r) return NextResponse.json({ status: "error" }, { status: 500 })
  if (r.status !== "ok" || !r.order) return NextResponse.json({ status: "gone" }, { status: 404 })
  const qr = r.order.state === "PENDING_PAYMENT" && r.khqr ? khqrWithAmount(r.khqr, Number(r.order.total)) : null
  return NextResponse.json({ ...r, khqr: qr }, { headers: { "Cache-Control": "no-store" } })
}
