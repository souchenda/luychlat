import { NextResponse } from "next/server"

import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cleanUtilityBill } from "@/lib/utility-bill"

/**
 * Utility bill OCR for the bill form: a photo of a paper electricity / water bill
 * (EDC, private distributors such as AKISANI KOUR SROV, PPWSA) → provider, customer,
 * place, invoice, due date, amount, usage and rate. Signed-in users only; Gemini
 * Vision (Groq while it is overloaded); every field checked; nothing logged.
 */
export const runtime = "nodejs"

const MAX_BYTES = 5_000_000

const PROMPT = [
  "This image should be a Cambodian utility bill (វិក្កយបត្រអគ្គិសនី / ទឹក): EDC, a private electricity distributor (e.g. AKISANI KOUR SROV), or PPWSA water.",
  "Answer JSON only:",
  '{"is_bill": boolean, "kind": "ELECTRICITY" | "WATER", "provider": string | null, "customer_id": string | null, "customer_name": string | null, "location": string | null, "invoice_no": string | null, "due_date": "YYYY-MM-DD" | null, "amount_due": number | null, "currency": "KHR" | "USD", "consumption": number | null, "rate": number | null}',
  "provider: the company name as printed (Khmer and the Latin name in brackets, e.g. \"ក្រុមហ៊ុន អគ្គិសនី គួរស្រូវ ឯ.ក (AKISANI KOUR SROV)\").",
  "customer_id: the customer / account number (e.g. \"539-011685\"). customer_name and location (the address, e.g. \"ផ្ទះ 37 ( 3A ) បុរីពិភពថ្មីគួរស្រូវ 3\") as printed. invoice_no: e.g. \"CINV26-256297\".",
  "amount_due: the TOTAL amount to pay (សរុបត្រូវបង់), as a number (\"692,100\" → 692100). Not a previous balance, not a meter reading. Khmer digits ០-៩ → 0-9.",
  "due_date: the payment deadline (ថ្ងៃផុតកំណត់បង់ប្រាក់). consumption: this period's usage in kWh (electricity) or m³ (water) — not a meter index. rate: price per kWh / m³.",
  'Use null for anything not clearly readable — never guess. If it is not a utility bill, answer {"is_bill": false}.',
].join("\n")

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

  const image = Buffer.from(await file.arrayBuffer()).toString("base64")
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, PROMPT)])
  if (groq) readers.push(["Groq", () => askGroq(groq, file.type, image, PROMPT)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "bills", `Bill read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      const bill = cleanUtilityBill(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
      return NextResponse.json(bill ? { bill, reader: name } : { error: "not_a_bill" }, { status: bill ? 200 : 422 })
    } catch {
      logEvent("warn", "bills", `Bill read: ${name} answered without JSON`, { fold: true })
    }
  }
  return NextResponse.json({ error: "busy" }, { status: 503 })
}
