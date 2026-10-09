import { NextResponse } from "next/server"

import { cleanNssfCard } from "@/lib/nssf-card"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * NSSF card OCR for the "new member" form: the front of a ប.ស.ស. card → name
 * (Khmer and Latin), card / ID number, date of birth, gender. Signed-in users only;
 * the image goes to Gemini Vision (Groq while it is overloaded) — the same readers
 * as bank slips — and nothing from the card is logged or kept here. The photo
 * itself is saved by the form, in the owner's private storage.
 */
export const runtime = "nodejs"

const MAX_BYTES = 5_000_000

/** For the auto-crop: where the physical card is in the photo. */
const CORNERS =
  "corners: the 4 corners of the physical card itself (not the photo, not the printed frame) — top-left, top-right, bottom-right, bottom-left — each as [x, y] on a 0–1000 scale of the image width and height (x from the left, y from the top). null if any edge of the card is cut off or unclear."

/** The back of a card: only where it is, to crop it. */
const BACK_PROMPT = [
  "This image should be the BACK of a Cambodian NSSF (ប.ស.ស.) member card or a Khmer national ID card, possibly photographed on a table.",
  "Answer JSON only:",
  '{"is_card": boolean, "corners": [[x, y], [x, y], [x, y], [x, y]] | null}',
  CORNERS,
].join("\n")

const PROMPT = [
  "This image should be the FRONT of a Cambodian NSSF (ប.ស.ស. / បេឡាជាតិរបស់សន្តិសុខសង្គម) member card, or a Khmer national ID card.",
  "Answer JSON only:",
  '{"is_card": boolean, "name_kh": string | null, "name_en": string | null, "id_number": string | null, "dob": "YYYY-MM-DD" | null, "gender": "MALE" | "FEMALE" | null, "corners": [[x, y], [x, y], [x, y], [x, y]] | null}',
  CORNERS,
  "name_kh: the full name in Khmer script exactly as printed (e.g. \"ស៊ូ ចិន្តា\"). name_en: the full name in Latin letters as printed (e.g. \"SOU CHENDA\").",
  "id_number: the NSSF / card number as printed, keeping dashes and any Khmer letter at the end (e.g. \"1870219-1998577-ឈ\").",
  "dob: the date of birth (Khmer digits ០-៩ → 0-9). gender: ប្រុស = MALE, ស្រី = FEMALE.",
  'Use null for anything not clearly readable — never guess. If it is not such a card, answer {"is_card": false}.',
].join("\n")

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "nssf-ocr", limit: 10, windowMs: 60_000, maxBytes: MAX_BYTES + 10_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let file: File | null = null
  let back = false
  try {
    const form = await request.formData()
    const v = form.get("image")
    file = v instanceof File ? v : null
    back = form.get("side") === "back"
  } catch {
    file = null
  }
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const image = Buffer.from(await file.arrayBuffer()).toString("base64")
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  const readers: [string, () => Promise<Answer>][] = []
  const prompt = back ? BACK_PROMPT : PROMPT
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, file.type, image, prompt)])
  // Corners need a careful reader: Groq (weaker at locating) only reads the front's text.
  if (groq && !back) readers.push(["Groq", () => askGroq(groq, file.type, image, prompt)])
  for (const [name, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "nssf", `Card read: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      const raw = JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()) as Record<string, unknown>
      // Corners only from Gemini (checked again on the phone before any crop).
      const corners = name === "Gemini" && Array.isArray(raw?.corners) ? raw.corners : null
      if (back) return NextResponse.json({ corners }, { status: 200 })
      const card = cleanNssfCard(raw)
      return NextResponse.json(card ? { card, corners, reader: name } : { error: "not_a_card", corners }, { status: card ? 200 : 422 })
    } catch {
      logEvent("warn", "nssf", `Card read: ${name} answered without JSON`, { fold: true })
    }
  }
  return NextResponse.json({ error: "busy" }, { status: 503 })
}
