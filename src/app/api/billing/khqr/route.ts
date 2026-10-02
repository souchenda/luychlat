import { NextResponse } from "next/server"
import { z } from "zod"

import { khqrConfig } from "@/lib/server/khqr-config"
import { createKhqrPayment, currentUser } from "@/lib/server/khqr-service"
import { guardRequest, readJson } from "@/lib/server/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Is KHQR checkout available (and in which mode)? No secrets. */
export async function GET() {
  const cfg = khqrConfig()
  return NextResponse.json({ mode: cfg.mode })
}

const body = z
  .object({
    plan_code: z.enum(["PRO_MONTHLY", "PRO_YEARLY"]),
    currency: z.enum(["USD", "KHR"]),
  })
  .strict()

/** Creates a dynamic KHQR for the chosen plan (amount from public.plans). */
export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "khqr-create", limit: 10, windowMs: 10 * 60_000, maxBytes: 1_000 })
  if (blocked) return blocked
  const cfg = khqrConfig()
  if (cfg.mode === "off") return NextResponse.json({ error: "khqr_unavailable" }, { status: 503 })

  const session = await currentUser()
  if (!session) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })

  const json = await readJson(request, 1_000)
  const parsed = body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

  try {
    const origin = new URL(request.url).origin
    const view = await createKhqrPayment(session.user.id, parsed.data.plan_code, parsed.data.currency, cfg, origin)
    return NextResponse.json(view)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "create_failed"
    const status = reason === "too_many_qr" ? 429 : reason === "unknown_plan" ? 400 : 500
    if (status === 500) console.error("[khqr] create failed", error)
    return NextResponse.json({ error: reason }, { status })
  }
}
