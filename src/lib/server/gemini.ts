// Server only: one Gemini request through the shared model chain (lib/gemini-models.ts — founder, 26/10/2026, Tasks
// #512–#514). The caller builds the request (its own system prompt, contents and generationConfig) and reads the answer;
// this tries gemini-3.5-flash, then gemini-flash-latest, each with its share of the caller's time limit — a model that is
// down, busy, out of quota, retired or too slow hands over to the next at once. Used by voice notes, every photo reader,
// the advisor, the bot's /ai and the Fiqh assistant.
import { failureLine, GEMINI_MODELS, geminiModelUrl, perModelTimeout } from "@/lib/gemini-models"

export type GeminiFailure = { model: string; why: string; status?: number }
export type GeminiResult = { ok: true; res: Response; model: string } | { ok: false; fails: GeminiFailure[]; line: string; status: number | null }

/** No «thinking» (measured 26/10/2026 on gemini-3.5-flash: an answer in 3.2 s instead of 11–16 s). */
export const NO_THINKING = { thinkingBudget: 0 } as const

export async function geminiChain(key: string, request: Record<string, unknown>, totalMs: number): Promise<GeminiResult> {
  const fails: GeminiFailure[] = []
  const body = JSON.stringify(request)
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(geminiModelUrl(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(perModelTimeout(totalMs)),
      })
      if (res.ok) return { ok: true, res, model }
      // The status and the provider's message only — never the key or the request.
      const message = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)
      fails.push({ model, why: `HTTP ${res.status}${message ? ` ${message}` : ""}`, status: res.status })
    } catch (e) {
      fails.push({ model, why: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "request failed" })
    }
  }
  const status = [...fails].reverse().find((f) => f.status)?.status ?? null
  return { ok: false, fails, line: failureLine(fails.map((f) => ({ model: f.model, why: f.why.split(" ").slice(0, 2).join(" ") }))), status }
}
