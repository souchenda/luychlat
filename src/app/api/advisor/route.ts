import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"

import { advisorRequestSchema, type AdvisorRequest } from "@/lib/advisor/payload"

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
    "You are LuySmart's financial advisor for people and small businesses in Cambodia.",
    `Always answer in ${language}. Keep answers short and practical for a phone screen: a one-line summary, then at most 5 bullet points.`,
    "Base every number on the JSON data below; never invent figures. Amounts are USD equivalents; khrPerUsd converts to riel (៛).",
    "Debts are anonymous references (P1, P2 = money the user owes; R1 = money owed to the user). Refer to them by these references.",
    "When asked which debt to pay first, compare Debt Snowball (smallest balance first) and Debt Avalanche (highest interest first) using the balances, rates and due dates.",
    "Debt-to-income (dti) is monthlyDebtService / avgIncome; above 0.36 is high, above 0.5 is risky. shortfall30 > 0 means payables due within 30 days exceed projected cash.",
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

async function askClaude(req: AdvisorRequest): Promise<string> {
  const client = new Anthropic({ apiKey: req.apiKey })
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

export async function POST(request: Request) {
  const parsed = advisorRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 })
  const req = parsed.data

  try {
    const text = req.provider === "anthropic" ? await askClaude(req) : await askOpenAI(req)
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
