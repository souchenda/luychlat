import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { resolveSlipAcrossWorkspaces } from "./bot/bank-slip"
import { failureLine, GEMINI_MODELS, geminiModelUrl, perModelTimeout } from "./gemini-models"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("One Gemini model chain for voice and every photo reader (founder, 26/10/2026 — Tasks #512 / #513)", () => {
  it("gemini-3.5-flash first, gemini-flash-latest after it; the URL of each", () => {
    assert.deepEqual([...GEMINI_MODELS], ["gemini-3.5-flash", "gemini-flash-latest"])
    assert.equal(geminiModelUrl("gemini-3.5-flash"), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent")
  })
  it("each model's share of the caller's limit: a slip's 20 s → 10 s each, a loan schedule's 35 s → 17.5 s; never under 8 s", () => {
    assert.deepEqual([perModelTimeout(20_000), perModelTimeout(35_000), perModelTimeout(12_000), perModelTimeout(30_000, 1)], [10_000, 17_500, 8_000, 30_000])
  })
  it("what every model said, in one log line", () => {
    assert.equal(failureLine([{ model: "gemini-3.5-flash", why: "HTTP 503" }, { model: "gemini-flash-latest", why: "timed out" }]), "gemini-3.5-flash HTTP 503 · gemini-flash-latest timed out")
  })
  it("the slip reader (askGemini, shared by every photo reader): the chain, thinking off, no waiting retries, the model logged", () => {
    const s = read("src/lib/server/slip-bot.ts")
    assert.doesNotMatch(s, /gemini-flash-latest:generateContent|const GEMINI_URL/)
    assert.match(s, /const got = await geminiChain\(\n\s+key,/)
    assert.match(s, /if \(!got\.ok\) return \{ fail: got\.line \}/)
    assert.match(s, /thinkingConfig: NO_THINKING/)
    assert.doesNotMatch(s, /for \(const wait of \[1500, 4000\]\)/) // the next model is the retry
    assert.match(s, /logEvent\("info", "slips", `Slip read by \$\{"model" in got && got\.model \? got\.model : name\}`, \{ fold: true \}\)/)
    // Groq stays the last resort after every Gemini model.
    assert.ok(s.indexOf('readers.push(["Gemini"') < s.indexOf('readers.push(["Groq"'))
    // Every Gemini caller goes through the one chain (Task #514): no module names a model or a Gemini URL itself.
    for (const f of ["src/lib/server/transcribe.ts", "src/app/api/advisor/route.ts", "src/lib/server/ai-bot.ts", "src/lib/server/fiqh-assistant.ts", "src/lib/server/slip-bot.ts"]) {
      const c = read(f)
      assert.match(c, /await geminiChain\(/, f)
      assert.doesNotMatch(c, /generativelanguage\.googleapis\.com|gemini-flash-latest:|GEMINI_URL/, f)
    }
  })
})

describe("A slip from a DL MEAT SUPPLY account stays in the business (Task #513 — the wallets as on production, 26/10/2026)", () => {
  const W = (id: string, name: string, currency: "USD" | "KHR", account_no: string | null) => ({ id, name, currency, kind: "BANK", account_no, icon: null })
  const personal = {
    id: "personal",
    name: "ផ្ទាល់ខ្លួន",
    wallets: [W("p1", "អេស៊ីលីដា 016***4222 USD", "USD", "016824222"), W("p2", "អេស៊ីលីដា 016***4222 KHR", "KHR", "016824222"), W("p3", "ABA Bank", "USD", "078824222")],
  }
  const dl = { id: "dl", name: "DL MEAT SUPPLY", wallets: [W("d1", "ABA DL KHR", "KHR", "016472333"), W("d2", "ABA DL USD", "USD", null)] }
  const pick = (slip: Parameters<typeof resolveSlipAcrossWorkspaces>[0]) => {
    const r = resolveSlipAcrossWorkspaces(slip, [personal, dl] as never)
    return r && "wallet" in r ? `${r.wallet.workspaceName} · ${r.wallet.wallet.name}` : JSON.stringify(r)
  }
  it("«DL USD (016 824 222)» on an ABA slip → ABA DL USD in DL MEAT SUPPLY — never the personal ACLEDA with that number", () => {
    assert.equal(pick({ bank: "ABA BANK", currency: "USD", account: "016 824 222", accountName: "DL USD" }), "DL MEAT SUPPLY · ABA DL USD")
  })
  it("the DL KHR account by its number → ABA DL KHR in DL MEAT SUPPLY", () => {
    assert.equal(pick({ bank: "ABA BANK", currency: "KHR", account: "016 472 333", accountName: null }), "DL MEAT SUPPLY · ABA DL KHR")
  })
})
