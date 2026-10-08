import { NextResponse } from "next/server"

import { readUtilityBill } from "@/lib/server/bill-ocr"
import { guardRequest } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Utility bill OCR for the bill form: a photo of a paper electricity / water bill
 * (EDC, private distributors such as AKISANI KOUR SROV, PPWSA) → provider, customer,
 * place, invoice, due date, amount, usage and rate. Signed-in users only; the
 * reader is shared with the bot (src/lib/server/bill-ocr.ts); nothing is logged.
 */
export const runtime = "nodejs"

const MAX_BYTES = 5_000_000

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "bills-ocr", limit: 10, windowMs: 60_000, maxBytes: MAX_BYTES + 10_000 })
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

  const bill = await readUtilityBill(file.type, Buffer.from(await file.arrayBuffer()).toString("base64"))
  if (bill === "busy") return NextResponse.json({ error: "busy" }, { status: 503 })
  return NextResponse.json(bill ? { bill } : { error: "not_a_bill" }, { status: bill ? 200 : 422 })
}
