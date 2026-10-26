// Server only: the guarded Islamic reference assistant (founder, 19/10/2026) on the server's GEMINI_API_KEY. The
// guards are in lib/islamic/fiqh-guard.ts: boundary questions never reach the model, the system prompt keeps it a
// navigator of Shafi'i / Sunni teaching (never a fatwa), and every reply ends with the disclaimer.
import { FIQH_QUESTION_MAX, FIQH_REFERRAL, fiqhBoundary, fiqhSystemPrompt, finishFiqhAnswer, withDisclaimer } from "@/lib/islamic/fiqh-guard"
import { logEvent } from "@/lib/server/events"
import { geminiChain, NO_THINKING } from "@/lib/server/gemini"

type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  promptFeedback?: { blockReason?: string }
}

export type FiqhReply = { kind: "answer" | "referral" | "unavailable"; text: string }

/** Plain text: no Markdown that slips through. */
const plain = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .trim()

export async function askFiqh(question: string, locale: "km" | "en"): Promise<FiqhReply> {
  const q = question.trim().slice(0, FIQH_QUESTION_MAX)
  // Guard 1: divorce, inheritance and sectarian questions go to the Imams, never to the model.
  if (fiqhBoundary(q)) return { kind: "referral", text: withDisclaimer(FIQH_REFERRAL[locale], locale) }
  const unavailable: FiqhReply = {
    kind: "unavailable",
    text: locale === "km" ? "សូមអភ័យទោស ជំនួយការមិនអាចឆ្លើយបានពេលនេះទេ។ សូមសាកម្ដងទៀតបន្តិចក្រោយ។" : "Sorry, the assistant can't answer right now. Please try again shortly.",
  }
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) return unavailable
  try {
    // The shared model chain (lib/server/gemini.ts — Task #514): gemini-3.5-flash, then gemini-flash-latest, thinking
    // off; the same system prompt and guards.
    const got = await geminiChain(
      key,
      { systemInstruction: { parts: [{ text: fiqhSystemPrompt(locale) }] }, contents: [{ role: "user", parts: [{ text: q }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: NO_THINKING } },
      40_000,
    )
    if (!got.ok) {
      logEvent("error", "fiqh", `Gemini: ${got.line}`, { fold: true })
      return unavailable
    }
    const body = (await got.res.json()) as GeminiResponse
    const candidate = body.candidates?.[0]
    // A blocked answer is a question for a person, not for the model.
    if (body.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      return { kind: "referral", text: withDisclaimer(FIQH_REFERRAL[locale], locale) }
    }
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
    // Guards 2 and 3: the model's referral marker, or a boundary topic in its answer → the referral; always the disclaimer.
    return finishFiqhAnswer(plain(text), locale) ?? unavailable
  } catch (e) {
    logEvent("error", "fiqh", `Gemini failed: ${(e as Error).message}`, { fold: true })
    return unavailable
  }
}
