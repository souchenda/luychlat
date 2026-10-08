import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { advisorRequestSchema, type AdvisorRequest } from "@/lib/advisor/payload"
import { DOMAIN_RULE, isOffTopic, OFF_TOPIC_REPLY } from "@/lib/ai-guard"
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

function systemPrompt(req: AdvisorRequest) {
  const language = req.language === "km" ? "Khmer (ភាសាខ្មែរ)" : "English"
  return [
    DOMAIN_RULE,
    "You are LuyChlat's financial advisor for people and small businesses in Cambodia.",
    `Always answer in ${language}. Keep answers short and practical for a phone screen: a one-line summary, then at most 5 bullet points.`,
    "Base every number on the JSON data below; never invent figures. Amounts are USD equivalents; khrPerUsd converts to riel (៛).",
    "Debts are anonymous references (P1, P2 = money the user owes; R1 = money owed to the user). Refer to them by these references.",
    "When asked which debt to pay first, compare Debt Snowball (smallest balance first) and Debt Avalanche (highest interest first) using the balances, rates and due dates.",
    "Debt-to-income (dti) is monthlyDebtService / avgIncome; above 0.36 is high, above 0.5 is risky. shortfall30 > 0 means payables due within 30 days exceed projected cash.",
    "score is a 300–850 financial health score (like a credit score): 740+ excellent, 670+ good, 580+ fair, below that needs work. scoreFactors (0–1 each) are its weighted parts: repayment 40% (no overdue payables), dti 30%, savings 20% (savings rate), buffer 10% (months of spending held as cash). When asked how to raise the score, start with the factor that has the most points left (weight × (1 − value) × 550) and give concrete, numbered steps with amounts.",
    "You give general guidance, not licensed financial advice; mention this briefly only when recommending a significant decision.",
    "",
    "Financial data (JSON):",
    JSON.stringify(req.snapshot),
  ].join("\n")
}

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

type Quota = { ok: boolean; reason?: "plan_required" | "quota_exceeded" | "daily_quota"; used: number; limit: number; daily?: boolean }

/**
 * Pro AI: LuyChlat's own Anthropic key (server-only ANTHROPIC_API_KEY). The
 * signed-in user is verified with auth.getUser(), the plan and monthly quota
 * are checked in the database before the call, and one query is counted
 * only after a successful answer.
 */
async function askLuyChlat(req: AdvisorRequest) {
  const serverKey = process.env.ANTHROPIC_API_KEY
  if (!serverKey) return NextResponse.json({ error: "ai_unavailable" }, { status: 503 })
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
    const text = await askClaude(req, serverKey)
    const used = await supabase.rpc("use_ai_query", { p_commit: true })
    return NextResponse.json({ text, quota: used.data ?? quota })
  } catch (error) {
    // Never blame the user's key here: it's ours.
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    return NextResponse.json({ error: "provider_error" }, { status: 502 })
  }
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
