import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { readSlipImage } from "@/lib/server/slip-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The app's own slip scanner (founder, 21/10/2026 — «ស្កេនវិក្កយបត្រ» no longer sends people out to Telegram): a bank
 * slip photo → what the bot reads from it (lib/server/slip-bot.ts, the same prompt and checks). Nothing is saved here —
 * the scanner shows the amount, the wallet and the category for the person to confirm first (lib/slip-intake.ts).
 */
export const runtime = "nodejs"
const MAX_BYTES = 6 * 1024 * 1024

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "slip", limit: 10, windowMs: 60_000, maxBytes: MAX_BYTES + 10_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  // The same feature flag as the bot's slip reader (Admin › Super): off for this account → the scanner says so.
  const { data: features } = await supabase.rpc("my_features")
  if ((features as Record<string, boolean> | null)?.bank_slips === false) return NextResponse.json({ error: "feature" }, { status: 403 })
  let file: File | null = null
  try {
    const v = (await request.formData()).get("image")
    file = v instanceof File ? v : null
  } catch {
    file = null
  }
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const read = await readSlipImage(file.type, Buffer.from(await file.arrayBuffer()).toString("base64"))
  if ("slip" in read) {
    logEvent("info", "slips", `App slip read: ${read.slip.bank ?? "bank ?"} ${read.slip.direction}`, { fold: true })
    return NextResponse.json({ slip: read.slip })
  }
  return NextResponse.json({ error: read.error }, { status: read.error === "busy" ? 503 : 422 })
}
