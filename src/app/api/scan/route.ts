import { NextResponse } from "next/server"

import { cleanLoanDetail, loanDetailPrompt } from "@/lib/loans/loan-detail-read"
import { ACCOUNT_PROMPT, cleanAccount, cleanVehicle, VEHICLE_PROMPT, type ScanKind } from "@/lib/scan"
import { logEvent } from "@/lib/server/events"
import { guardRequest } from "@/lib/server/guard"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { askGemini, askGroq, type Answer } from "@/lib/server/slip-bot"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Camera-first intake: a photo → the fields of the form it was taken from (kind: account | vehicle |
 * loan). Nothing is saved here — the form shows the fields for the person to review first.
 */
export const runtime = "nodejs"
const MAX_BYTES = 6 * 1024 * 1024
const KINDS: ScanKind[] = ["account", "vehicle", "loan"]

const READERS: Record<ScanKind, { prompt: (today: string) => string; clean: (raw: unknown) => unknown }> = {
  account: { prompt: () => ACCOUNT_PROMPT, clean: cleanAccount },
  vehicle: { prompt: () => VEHICLE_PROMPT, clean: cleanVehicle },
  loan: { prompt: loanDetailPrompt, clean: cleanLoanDetail },
}

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "scan", limit: 10, windowMs: 60_000, maxBytes: MAX_BYTES + 10_000 })
  if (blocked) return blocked
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  let file: File | null = null
  let kind: ScanKind | null = null
  try {
    const form = await request.formData()
    const v = form.get("image")
    file = v instanceof File ? v : null
    const k = form.get("kind")
    kind = typeof k === "string" && (KINDS as string[]).includes(k) ? (k as ScanKind) : null
  } catch {
    file = null
  }
  if (!file || !kind || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  const image = Buffer.from(await file.arrayBuffer()).toString("base64")
  const reader = READERS[kind]
  const prompt = reader.prompt(phnomPenhToday().day)
  const asks: [string, () => Promise<Answer>][] = []
  if (gemini) asks.push(["Gemini", () => askGemini(gemini, file.type, image, prompt, 800, 35_000)])
  if (groq) asks.push(["Groq", () => askGroq(groq, file.type, image, prompt, 800)])
  for (const [name, ask] of asks) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "scan", `Scan ${kind}: ${name} ${got.fail}`, { fold: true })
      continue
    }
    try {
      const read = reader.clean(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
      return read ? NextResponse.json({ kind, read }) : NextResponse.json({ error: "unreadable" }, { status: 422 })
    } catch {
      logEvent("warn", "scan", `Scan ${kind}: ${name} answered without JSON`, { fold: true })
    }
  }
  return NextResponse.json({ error: "busy" }, { status: 503 })
}
