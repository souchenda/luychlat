import { NextResponse } from "next/server"

import { FIQH_QUESTION_MAX } from "@/lib/islamic/fiqh-guard"
import { askFiqh } from "@/lib/server/fiqh-assistant"
import { guardRequest } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The guarded Islamic reference assistant (founder, 19/10/2026 — foundation; the screen comes next): { question,
 * locale } from a signed-in member → { kind: answer | referral | unavailable, text }. Divorce, inheritance and
 * sectarian questions are referred to the Imams before any model is asked; every reply carries the disclaimer.
 */
export const runtime = "nodejs"

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "islamic-fiqh", limit: 6, windowMs: 60_000, maxBytes: 4_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { question?: unknown; locale?: unknown } | null
  const question = typeof body?.question === "string" ? body.question.trim() : ""
  if (question.length < 3 || question.length > FIQH_QUESTION_MAX) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const reply = await askFiqh(question, body?.locale === "en" ? "en" : "km")
  return NextResponse.json(reply, { status: reply.kind === "unavailable" ? 503 : 200 })
}
