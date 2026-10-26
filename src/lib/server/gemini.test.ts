import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { geminiChain, NO_THINKING } from "./gemini"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fetch that answers each call from the list, and records which model each call asked. */
function stub(answers: ((url: string) => Response | Promise<Response>)[]) {
  const asked: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    asked.push(url.split("/models/")[1]?.split(":")[0] ?? url)
    const next = answers.shift()
    if (!next) throw new Error("unexpected call")
    return next(url)
  }) as typeof fetch
  return asked
}
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }), { status: 200 })
const busy = (status: number) => () => new Response(JSON.stringify({ error: { message: "This model is currently experiencing high demand." } }), { status })

describe("geminiChain — the shared model chain (founder, 26/10/2026 — Task #514)", () => {
  it("the first model answers: one call, that model named", async () => {
    const asked = stub([ok])
    const r = await geminiChain("k", { contents: [] }, 20_000)
    assert.equal(r.ok, true)
    assert.deepEqual(asked, ["gemini-3.5-flash"])
    assert.equal(r.ok && r.model, "gemini-3.5-flash")
  })
  it("503 «high demand» on the first → the next at once, no waiting retry", async () => {
    const asked = stub([busy(503), ok])
    const started = Date.now()
    const r = await geminiChain("k", { contents: [] }, 20_000)
    assert.deepEqual(asked, ["gemini-3.5-flash", "gemini-flash-latest"])
    assert.equal(r.ok && r.model, "gemini-flash-latest")
    assert.ok(Date.now() - started < 1_000)
  })
  it("every model failing: one log line for all, and the last HTTP status (429 → the advisor's «busy»)", async () => {
    stub([busy(503), busy(429)])
    const r = await geminiChain("k", { contents: [] }, 20_000)
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.line, "gemini-3.5-flash HTTP 503 · gemini-flash-latest HTTP 429")
    assert.equal(r.status, 429)
  })
  it("a model that hangs is cut at its share and the next is asked; network errors too", async () => {
    stub([
      () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), 5)),
      () => Promise.reject(new TypeError("fetch failed")),
    ])
    const r = await geminiChain("k", { contents: [] }, 20_000)
    assert.equal(!r.ok && r.line, "gemini-3.5-flash timed out · gemini-flash-latest request failed")
    assert.equal(!r.ok && r.status, null)
  })
  it("thinking off is the shared setting", () => {
    assert.deepEqual(NO_THINKING, { thinkingBudget: 0 })
  })
})
