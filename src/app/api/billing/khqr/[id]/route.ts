import { NextResponse } from "next/server"

import { khqrConfig } from "@/lib/server/khqr-config"
import { currentUser, loadPayment, refreshStatus } from "@/lib/server/khqr-service"
import { guardRequest } from "@/lib/server/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Status of the user's own KHQR payment. Polled by the checkout every few
 * seconds; checks Bakong by MD5 and, when paid, activates PRO atomically.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardRequest(request, { name: "khqr-status", limit: 40, windowMs: 60_000, maxBytes: 0 })
  if (blocked) return blocked
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  const cfg = khqrConfig()
  if (cfg.mode === "off") return NextResponse.json({ error: "khqr_unavailable" }, { status: 503 })

  const session = await currentUser()
  if (!session) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })
  const payment = await loadPayment(id, session.user.id)
  if (!payment) return NextResponse.json({ error: "not_found" }, { status: 404 })

  try {
    return NextResponse.json(await refreshStatus(payment, cfg))
  } catch (error) {
    console.error("[khqr] status failed", error)
    return NextResponse.json({ error: "status_failed" }, { status: 500 })
  }
}
