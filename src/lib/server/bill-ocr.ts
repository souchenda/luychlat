// Server only: reading a paper utility bill (electricity / water) from an image —
// shared by the app's /api/bills/ocr and the bot (a bill photo sent to @luychlat_bot).
// Gemini Vision first, Groq while it is overloaded; nothing from the bill is logged.
import { createCanvas, loadImage } from "@napi-rs/canvas"
import jsQR from "jsqr"

import { isKhqr } from "@/lib/khqr"
import { cleanUtilityBill, type UtilityBill } from "@/lib/utility-bill"

import { logEvent } from "./events"
import { askGemini, askGroq, type Answer } from "./slip-bot"

export const BILL_PROMPT = [
  "This image should be a Cambodian utility bill (វិក្កយបត្រអគ្គិសនី / ទឹក): EDC, a private electricity distributor (e.g. AKISANI KOUR SROV), or PPWSA water.",
  "Answer JSON only:",
  '{"is_bill": boolean, "kind": "ELECTRICITY" | "WATER", "provider": string | null, "customer_id": string | null, "customer_name": string | null, "location": string | null, "invoice_no": string | null, "due_date": "YYYY-MM-DD" | null, "amount_due": number | null, "currency": "KHR" | "USD", "consumption": number | null, "rate": number | null}',
  "provider: the company name as printed (Khmer and the Latin name in brackets, e.g. \"ក្រុមហ៊ុន អគ្គិសនី គួរស្រូវ ឯ.ក (AKISANI KOUR SROV)\").",
  "customer_id: the customer / account number (e.g. \"539-011685\"). customer_name and location (the address, e.g. \"ផ្ទះ 37 ( 3A ) បុរីពិភពថ្មីគួរស្រូវ 3\") as printed. invoice_no: e.g. \"CINV26-256297\".",
  "amount_due: the TOTAL amount to pay (សរុបត្រូវបង់), as a number (\"692,100\" → 692100). Not a previous balance, not a meter reading. Khmer digits ០-៩ → 0-9.",
  "due_date: the payment deadline (ថ្ងៃផុតកំណត់បង់ប្រាក់). consumption: this period's usage in kWh (electricity) or m³ (water) — not a meter index. rate: price per kWh / m³.",
  'Use null for anything not clearly readable — never guess. If it is not a utility bill, answer {"is_bill": false}.',
].join("\n")

/** The bill on an image (base64), or "busy" when no reader answered, or null when it isn't one. */
export async function readUtilityBill(type: string, image: string): Promise<UtilityBill | "busy" | null> {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  const readers: [string, () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, type, image, BILL_PROMPT)])
  if (groq) readers.push(["Groq", () => askGroq(groq, type, image, BILL_PROMPT)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "bills", `Bill read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      return cleanUtilityBill(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
    } catch {
      logEvent("warn", "bills", `Bill read: ${name} answered without JSON`, { fold: true })
    }
  }
  return "busy"
}

/** The KHQR printed on a bill (to pay it), if the photo shows one clearly. */
export async function khqrOnImage(bytes: Uint8Array): Promise<string | null> {
  try {
    const img = await loadImage(Buffer.from(bytes))
    for (const max of [1400, 900, 2000]) {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = createCanvas(w, h)
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0, w, h)
      const found = jsQR(new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data), w, h)?.data
      if (found && isKhqr(found)) return found
    }
  } catch {
    // A picture we can't decode: no KHQR, the bill still works.
  }
  return null
}
