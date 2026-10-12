import { NextResponse } from "next/server"

import { cleanKScore, kscorePrompt } from "@/lib/kscore"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { askGemini } from "@/lib/server/slip-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * A CBC K-Score screenshot → the reading (score, CBC's label, date, history), for the person to
 * confirm before it is saved (credit_scores, owner-only). Nothing is stored here.
 */
export const runtime = "nodejs"
const MAX_BYTES = 6 * 1024 * 1024

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "kscore-ocr", limit: 6, windowMs: 60_000, maxBytes: MAX_BYTES + 10_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  let file: File | null = null
  try {
    const v = (await request.formData()).get("image")
    file = v instanceof File ? v : null
  } catch {
    file = null
  }
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const gemini = process.env.GEMINI_API_KEY?.trim()
  if (!gemini) return NextResponse.json({ error: "busy" }, { status: 503 })
  const today = phnomPenhToday().day
  const got = await askGemini(gemini, file.type, Buffer.from(await file.arrayBuffer()).toString("base64"), kscorePrompt(today), 700, 35_000)
  if ("fail" in got) {
    logEvent("warn", "kscore", `K-Score read: Gemini ${got.fail}`, { fold: true })
    return NextResponse.json({ error: "busy" }, { status: 503 })
  }
  try {
    const read = cleanKScore(JSON.parse(got.text.replace(/^\s*```(?:json)?|```\s*$/g, "").trim()), today)
    return read ? NextResponse.json({ read }) : NextResponse.json({ error: "not_kscore" }, { status: 422 })
  } catch {
    return NextResponse.json({ error: "busy" }, { status: 503 })
  }
}
