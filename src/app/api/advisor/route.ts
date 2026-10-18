import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { advisorRequestSchema, type AdvisorRequest } from "@/lib/advisor/payload"
import { isOffTopic, OFF_TOPIC_REPLY } from "@/lib/ai-guard"
import { advisorPlainText, advisorSystemPrompt } from "@/lib/advisor/prompt"
import { guardRequest, readJson } from "@/lib/server/guard"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// Snapshot + 12 short messages fit well within this.
const MAX_BYTES = 64_000

/**
 * Live AI advisor (guideline: "AI Engine: Claude API / OpenAI API (Serverless
 * Edge Functions)"). The request carries the user's own API key, used for this
 * call only and never stored or logged, plus an anonymous snapshot that is
 * re-validated against the strict allowlist schema.
 */
export const maxDuration = 60

const CLAUDE_MODEL = "claude-opus-5-5"

const systemPrompt = (req: AdvisorRequest) => advisorSystemPrompt(req)

function conversation(req: AdvisorRequest) {
  // The API expects the conversation to start with a user turn.
  const history = req.history.slice()
  while (history[0]?.role === "assistant") history.shift()
  return [...history, { role: "user" as const, content: req.question }]
}

async function askClaude(req: AdvisorRequest, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // Server-side fallback: if a safety classifier declines, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(req),
    messages: conversation(req),
  })
  if (response.stop_reason === "refusal") {
    return req.language === "km" ? "សូមអភ័យទោស ខ្ញុំមិនអាចឆ្លើយសំណួរនេះបានទេ។" : "Sorry, I can't help with that request."
  }
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim()
}

async function askOpenAI(req: AdvisorRequest): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({
      model: req.model ?? "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt(req) }, ...conversation(req)],
    }),
    signal: AbortSignal.timeout(55_000),
  })
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  } | null
  if (!res.ok) {
    const error = new Error(data?.error?.message ?? `OpenAI error ${res.status}`) as Error & { status: number }
    error.status = res.status
    throw error
  }
  return data?.choices?.[0]?.message?.content?.trim() ?? ""
}

/** Gemini Flash — the server's GEMINI_API_KEY (the model the Telegram bot uses). */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"

type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  promptFeedback?: { blockReason?: string }
}

/** The answer from Gemini; throws on HTTP / network errors (the client then answers offline). */
async function askGemini(req: AdvisorRequest, apiKey: string): Promise<string> {
  const contents = conversation(req).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
  const request = () =>
    fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(req) }] },
        contents,
        // Low thinking: ~5 s instead of 40–100 s (measured on production, 18/10/2026); "minimal" is refused.
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    })
  // "High demand" (503) and rate limits (429) are usually brief: try again — only while the 60 s route has time.
  const started = Date.now()
  let res = await request()
  for (const wait of [1500, 4000]) {
    if (res.ok || !(res.status === 429 || res.status >= 500) || Date.now() - started > 12_000) break
    await new Promise((resolve) => setTimeout(resolve, wait))
    res = await request()
  }
  if (!res.ok) {
    console.error(`[advisor] gemini failed: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`)
    const error = new Error(`gemini ${res.status}`) as Error & { status: number }
    error.status = res.status === 429 ? 429 : 502
    throw error
  }
  const body = (await res.json()) as GeminiResponse
  const candidate = body.candidates?.[0]
  if (body.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    return req.language === "km" ? "សូមអភ័យទោស ខ្ញុំមិនអាចឆ្លើយសំណួរនេះបានទេ។" : "Sorry, I can't help with that request."
  }
  const text = advisorPlainText(
    (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join(""),
  )
  if (!text) throw Object.assign(new Error("gemini empty"), { status: 502 })
  return text
}

/** LuyChlat AI's model: Gemini (GEMINI_API_KEY, founder 18/10/2026) first; Claude only when that key is set instead. */
const luyChlatModel = (): { name: "gemini" | "claude"; key: string } | null => {
  const gemini = process.env.GEMINI_API_KEY?.trim()
  if (gemini) return { name: "gemini", key: gemini }
  const claude = process.env.ANTHROPIC_API_KEY?.trim()
  return claude ? { name: "claude", key: claude } : null
}

type Quota = { ok: boolean; reason?: "plan_required" | "quota_exceeded" | "daily_quota"; used: number; limit: number; daily?: boolean }

/**
 * Pro AI with the server's own key (luyChlatModel: Gemini, else Claude). The signed-in user is verified with
 * auth.getUser(), the plan and monthly quota are checked in the database before the call, and one query is
 * counted only after a successful answer. A failure → an error code, and the app answers offline.
 */
async function askLuyChlat(req: AdvisorRequest) {
  const model = luyChlatModel()
  if (!model) return NextResponse.json({ error: "ai_unavailable" }, { status: 503 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })

  const check = await supabase.rpc("use_ai_query", { p_commit: false })
  if (check.error) return NextResponse.json({ error: "provider_error" }, { status: 502 })
  const quota = check.data as Quota
  // The FREE daily allowance is for the Telegram bot (Gemini Flash); in the app LuyChlat AI stays PRO.
  if (quota.daily) return NextResponse.json({ error: "plan_required", quota }, { status: 402 })
  if (!quota.ok) return NextResponse.json({ error: quota.reason, quota }, { status: 402 })

  try {
    const text = model.name === "gemini" ? await askGemini(req, model.key) : await askClaude(req, model.key)
    const used = await supabase.rpc("use_ai_query", { p_commit: true })
    return NextResponse.json({ text, quota: used.data ?? quota })
  } catch (error) {
    // Never blame the user's key here: it's ours.
    if (error instanceof Anthropic.RateLimitError || (error as { status?: number }).status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    return NextResponse.json({ error: "provider_error" }, { status: 502 })
  }
}

/** Whether LuyChlat AI (the server's own key) is configured — the app then uses it for Pro accounts by default. */
export async function GET() {
  return NextResponse.json({ luysmart: Boolean(luyChlatModel()) })
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "advisor", limit: 20, windowMs: 60_000, maxBytes: MAX_BYTES })
  if (blocked) return blocked
  const parsed = advisorRequestSchema.safeParse(await readJson(request, MAX_BYTES))
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 })
  const req = parsed.data
  // Guardrail layer 1: not about money → the fixed reply, no model call, no quota used.
  if (isOffTopic(req.question)) return NextResponse.json({ text: OFF_TOPIC_REPLY })

  if (req.provider === "luysmart") return askLuyChlat(req)

  try {
    const text = req.provider === "anthropic" ? await askClaude(req, req.apiKey!) : await askOpenAI(req)
    return NextResponse.json({ text })
  } catch (error) {
    // Most specific first; never echo the key back.
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json({ error: "invalid_key" }, { status: 401 })
    }
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: "provider_error" }, { status: 502 })
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) return NextResponse.json({ error: "invalid_key" }, { status: 401 })
    if (status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    return NextResponse.json({ error: "provider_error" }, { status: 502 })
  }
}
