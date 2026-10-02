import { NextResponse } from "next/server"

import { khqrConfig } from "@/lib/server/khqr-config"
import { confirmPayment, currentUser, loadPayment, toView } from "@/lib/server/khqr-service"
import { guardRequest } from "@/lib/server/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sandbox only, admins only: pretends Bakong reported the payment, so the
 * whole checkout (QR, timer, polling, instant PRO) can be tested without
 * real money. Refused in production mode and for sandbox-less payments.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardRequest(request, { name: "khqr-simulate", limit: 10, windowMs: 60_000, maxBytes: 100 })
  if (blocked) return blocked
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  const cfg = khqrConfig()
  if (cfg.mode !== "sandbox") return NextResponse.json({ error: "sandbox_only" }, { status: 403 })

  const session = await currentUser()
  if (!session) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })
  const { data: isAdmin } = await session.supabase.rpc("is_admin")
  if (isAdmin !== true) return NextResponse.json({ error: "admins_only" }, { status: 403 })

  const payment = await loadPayment(id, session.user.id)
  if (!payment || !payment.sandbox) return NextResponse.json({ error: "not_found" }, { status: 404 })
  try {
    const result = await confirmPayment(payment, `SANDBOX-${payment.id}`, Number(payment.amount), payment.currency, "sandbox@devb")
    return NextResponse.json(toView({ ...payment, status: "PAID" }, cfg, { period_end: result.period_end }))
  } catch (error) {
    console.error("[khqr] simulate failed", error)
    return NextResponse.json({ error: "simulate_failed" }, { status: 500 })
  }
}
