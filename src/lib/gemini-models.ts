// The Gemini models every reader tries in turn (founder, 26/10/2026 — Tasks #512 / #513). Measured on production that
// day: gemini-flash-latest answered 503 «high demand», then 429 «quota exceeded», all day — voice notes fell to Whisper,
// which invented words, and the $370 DL slip lost its category — while gemini-3.5-flash answered a voice note in 2.3 s and
// a slip image in JSON in 1.7–2.5 s, with «thinking» off. One list for voice and every photo reader. Pure
// (gemini-models.test.ts).

/** The primary first; the next is tried only when one fails (down, busy, out of quota, retired or too slow). */
export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-latest"] as const
export type GeminiModel = (typeof GEMINI_MODELS)[number]

export const geminiModelUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

/**
 * Each model's share of a reader's time limit: never more than the caller allowed in all (a slip's 20 s, a loan schedule's
 * 35 s), never under 8 s (an image in JSON takes ~2 s on a healthy model).
 */
export const perModelTimeout = (totalMs: number, models: number = GEMINI_MODELS.length) => Math.max(8_000, Math.round(totalMs / Math.max(1, models)))

/** «gemini-3.5-flash HTTP 503 · gemini-flash-latest timed out» — what every model said, for the event log. */
export const failureLine = (fails: { model: string; why: string }[]) => fails.map((f) => `${f.model} ${f.why}`).join(" · ")
