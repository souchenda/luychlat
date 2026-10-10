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
const CORNERS = [
  "box_2d: the bounding box of the physical card itself (its outer edges, not the photo, not the table) as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image height and width.",
  "corners: the card's 4 outer corners — top-left, top-right, bottom-right, bottom-left as they appear in the image — each as [y, x] on the same 0–1000 scale; null if a corner is hidden or unclear (box_2d is still given).",
].join("\n")

/** Only where the card is, to crop it: the back of a card, or a stored photo cropped again. */
const BACK_PROMPT = [
  "This image should show one card — a Cambodian NSSF (ប.ស.ស.) member card, a Khmer national ID card or a bank card, front or back — possibly photographed on a table or a bed.",
  "Answer JSON only:",
  '{"is_card": boolean, "box_2d": [ymin, xmin, ymax, xmax] | null, "corners": [[y, x], [y, x], [y, x], [y, x]] | null}',
  CORNERS,
].join("\n")

const PROMPT = [
  "This image should be the FRONT of a Cambodian NSSF (ប.ស.ស. / បេឡាជាតិរបស់សន្តិសុខសង្គម) member card, or a Khmer national ID card.",
  "Answer JSON only:",
  '{"is_card": boolean, "name_kh": string | null, "name_en": string | null, "id_number": string | null, "dob": "YYYY-MM-DD" | null, "gender": "MALE" | "FEMALE" | null, "box_2d": [ymin, xmin, ymax, xmax] | null, "corners": [[y, x], [y, x], [y, x], [y, x]] | null}',
  CORNERS,
  "name_kh: the line after \"គោត្តនាម និងនាម :\" transcribed VERBATIM, character by character, exactly as printed (e.g. \"ស៊ូ ចិន្តា\").",
  "Copy every consonant, subscript consonant (្ + consonant, e.g. ន្ត in ចិន្តា), vowel and sign (៉ ៊ ់ ិ ា …) as it appears on the card. NEVER transliterate or rebuild the Khmer name from the Latin name — Khmer spellings are not phonetic (CHENDA is printed ចិន្តា, never ឈិនដា). If a Khmer character is unclear, answer null for name_kh rather than guess.",
  "name_en: the full name in Latin letters as printed (e.g. \"SOU CHENDA\"), on its own — never inside name_kh.",
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
    // "back" and "crop": corners only (the back of a card; a stored photo cropped again).
    back = form.get("side") === "back" || form.get("side") === "crop"
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
      const box = name === "Gemini" && Array.isArray(raw?.box_2d) ? raw.box_2d : null
      if (back) return NextResponse.json({ corners, box }, { status: 200 })
      const card = cleanNssfCard(raw)
      return NextResponse.json(card ? { card, corners, box, reader: name } : { error: "not_a_card", corners, box }, { status: card ? 200 : 422 })
    } catch {
      logEvent("warn", "nssf", `Card read: ${name} answered without JSON`, { fold: true })
    }
  }
  return NextResponse.json({ error: "busy" }, { status: 503 })
}
