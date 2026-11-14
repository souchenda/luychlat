import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { networkCode, telegramRetryable } from "./telegram-retry"

describe("A Telegram call lost on the network is tried once more — only where it can never post twice (founder, 14/11/2026)", () => {
  it("an edit: always (the same edit again changes nothing)", () => {
    for (const code of ["ECONNRESET", "TimeoutError", "unknown"]) assert.equal(telegramRetryable("editMessageText", code), true, code)
  })
  it("a send: only when the request never left — never after a reset or a time-out (Telegram may have it)", () => {
    for (const code of ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]) assert.equal(telegramRetryable("sendMessage", code), true, code)
    for (const code of ["ECONNRESET", "TimeoutError", "UND_ERR_SOCKET", "unknown", undefined]) assert.equal(telegramRetryable("sendMessage", code), false, String(code))
  })
  it("the error's code for the log: undici's cause, else the error's own code or name", () => {
    assert.equal(networkCode(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })), "ENOTFOUND")
    assert.equal(networkCode(Object.assign(new Error("x"), { name: "TimeoutError" })), "TimeoutError")
    assert.equal(networkCode(null), "unknown")
  })
  it("wired in tg(): a 30 s limit, one retry when allowed, the code in the failure line; callers still see «network»", () => {
    const s = readFileSync(join(process.cwd(), "src/lib/server/telegram-bot.ts"), "utf8")
    assert.match(s, /signal: AbortSignal\.timeout\(TELEGRAM_TIMEOUT_MS\)/)
    assert.match(s, /if \(attempt === 1 && telegramRetryable\(method, code\)\) \{/)
    assert.match(s, /reportFailure\(method, `network \(\$\{code\}/)
    assert.match(s, /return \{ ok: false, description: "network" \}/)
  })
})
