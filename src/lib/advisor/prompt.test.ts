import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { advisorPlainText, advisorSystemPrompt } from "./prompt"

const snapshot = { asOf: "2026-10-18", score: 539, dti: 0.56 } as never

describe("LuyChlat AI — Gemini with the Khmer advisor prompt (founder, 18/10/2026)", () => {
  it("the prompt: natural Khmer, the exact question first, Snowball / Avalanche on the real debts, the person's data", () => {
    const p = advisorSystemPrompt({ language: "km", snapshot })
    assert.match(p, /natural, fluent Khmer/)
    assert.match(p, /Answer the person's exact question first/)
    assert.match(p, /Debt Snowball \(smallest balance first/)
    assert.match(p, /Money left to save each month = avgIncome − avgExpense − monthlyDebtService/)
    assert.match(p, /scoreFactors are 0–1 sub-scores of the health score, NOT ratios/) // Gemini once quoted one as the DTI
    assert.ok(p.endsWith(JSON.stringify(snapshot)))
    assert.match(advisorSystemPrompt({ language: "en", snapshot }), /Always answer in English\./)
  })
  it("Markdown the app can't show becomes plain lines; **bold** stays", () => {
    assert.equal(advisorPlainText("## ផែនការ\n* ជំហាន ១\n- ជំហាន ២\n**$300**"), "ផែនការ\n• ជំហាន ១\n• ជំហាន ២\n**$300**")
  })
  it("LuyChlat AI calls Gemini (GEMINI_API_KEY) first, through the shared model chain, thinking off (Task #514); Claude only without it; a failure → the offline answer", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/advisor/route.ts"), "utf8")
    assert.match(route, /const gemini = process\.env\.GEMINI_API_KEY\?\.trim\(\)\s+if \(gemini\) return \{ name: "gemini", key: gemini \}/)
    assert.match(route, /model\.name === "gemini" \? await askGemini\(req, model\.key\) : await askClaude\(req, model\.key\)/)
    assert.match(route, /const got = await geminiChain\(\n\s+apiKey,/)
    assert.match(route, /generationConfig: \{ temperature: 0\.4, maxOutputTokens: 4096, thinkingConfig: NO_THINKING \}/)
    assert.match(route, /error\.status = got\.status === 429 \? 429 : 502/)
    assert.match(route, /return NextResponse\.json\(\{ luysmart: Boolean\(luyChlatModel\(\)\) \}\)/)
    const chat = readFileSync(join(process.cwd(), "src/components/advisor/advisor-chat.tsx"), "utf8")
    assert.ok(chat.includes("content: `${note}\\n\\n${offline()}`, offline: true"))
  })
})
