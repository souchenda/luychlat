import { NextResponse } from "next/server"

import { khmerWordsToDigits } from "@/lib/bot/khmer-numbers"
import { whisperKhmerGuess } from "@/lib/bot/voice-guard"
import type { Locale } from "@/lib/i18n/dictionaries"
import { guardRequest } from "@/lib/server/guard"
import { transcribe, transcribeGemini, transcriptionProvider } from "@/lib/server/transcribe"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS, type VoiceEntryResponse } from "@/lib/voice-entry"

/**
 * 🎤 in the entry sheet (founder, 3/11/2026): a short voice note → what was heard, by the bot's engine
 * (lib/server/transcribe.ts — Gemini for Khmer, Whisper as the fallback). Nothing is saved or stored here: the audio goes
 * to the speech provider only, and the app fills the sheet for the person to check (lib/voice-entry.ts).
 */
export const runtime = "nodejs"

const reply = (body: VoiceEntryResponse, status = 200) => NextResponse.json(body, { status })

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "voice-entry", limit: 8, windowMs: 60_000, maxBytes: VOICE_MAX_BYTES + 10_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return reply({ error: "unauthorized" }, 401)
  // In testing for staff first (Admin › Super › voice_entry), like the slip scanner.
  const { data: features } = await supabase.rpc("my_features")
  if ((features as Record<string, boolean> | null)?.voice_entry === false) return reply({ error: "feature" }, 403)
  if (!transcriptionProvider() && !process.env.GEMINI_API_KEY?.trim()) return reply({ error: "off" }, 503)

  let audio: File | null = null
  let lang: Locale = "km"
  let seconds: number | undefined
  try {
    const form = await request.formData()
    const v = form.get("audio")
    audio = v instanceof File ? v : null
    const l = form.get("lang")
    if (l === "en" || l === "zh") lang = l
    const s = Number(form.get("seconds"))
    if (Number.isFinite(s) && s > 0) seconds = Math.min(s, VOICE_MAX_SECONDS)
  } catch {
    audio = null
  }
  if (!audio || !/^audio\//.test(audio.type) || audio.size < 500 || audio.size > VOICE_MAX_BYTES) return reply({ error: "invalid" }, 400)

  let transcript = await transcribe(audio, lang, seconds)
  // Gemini slow or down, or Whisper's invented Khmer: Gemini once more while the sheet still says «កំពុងស្តាប់»
  // (founder, 4/11/2026 — a failed note reads as «the app is broken»). Still nothing: «say it again», never shown the guess.
  const guess = (t: typeof transcript) => !t?.text.trim() || whisperKhmerGuess(t, khmerWordsToDigits(t.text))
  if (guess(transcript) && lang === "km") transcript = (await transcribeGemini(audio, seconds)) ?? transcript
  if (guess(transcript) && transcript?.text.trim()) return reply({ error: "busy" }, 422)
  const heard = transcript?.text.replace(/\s+/g, " ").trim().slice(0, 300) ?? ""
  if (!heard) return reply({ error: "failed" }, 422)
  const text = khmerWordsToDigits(heard)
  // Unsure and no amount in it: what was heard is shown, nothing is filled (the bot's rule — Task #507).
  if (transcript?.unsure && !/\d/.test(text)) return reply({ error: "unsure", heard }, 422)
  return reply({ heard, text })
}
