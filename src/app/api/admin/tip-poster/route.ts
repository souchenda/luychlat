import { NextResponse } from "next/server"

import { TIP_BODY_MAX, TIP_TITLE_MAX } from "@/lib/daily-tip"
import { callerDb } from "@/lib/server/admin-auth"
import { guardRequest } from "@/lib/server/guard"
import { tipPoster } from "@/lib/server/tip-poster"

/**
 * Admin › Super › Daily tips: the generated poster for a tip as PNG (the same
 * image the bot sends), so the text can be checked before approving. Body:
 * { day, title, body }. Super admins only.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "admin-tip-poster", limit: 30, windowMs: 60_000, maxBytes: 4_000 })
  if (blocked) return blocked
  const db = callerDb(request)
  const { data: superAdmin } = db ? await db.rpc("is_super_admin") : { data: false }
  if (superAdmin !== true) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  let b: Record<string, unknown>
  try {
    b = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null
  const title = typeof b.title === "string" ? b.title.trim().slice(0, TIP_TITLE_MAX) : ""
  const body = typeof b.body === "string" ? b.body.trim().slice(0, TIP_BODY_MAX) : ""
  if (!day || !title || !body) return NextResponse.json({ error: "invalid" }, { status: 400 })
  return new NextResponse(new Uint8Array(tipPoster({ title, body }, day)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  })
}
