import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { describe, it } from "node:test"

import { botIdFromToken, verifyTelegramLogin } from "./telegram-login"

const TOKEN = "123456789:TEST-token-not-real"
const sign = (fields: Record<string, string | number>) => {
  const lines = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`)
  return createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(lines.join("\n")).digest("hex")
}

describe("Telegram sign-in — the widget's data checked on the server", () => {
  const now = 1_800_000_000
  const fields = { id: 42, first_name: "Test", username: "tester", auth_date: now - 30 }
  it("genuine and fresh: the Telegram user's id", () => {
    assert.equal(verifyTelegramLogin({ ...fields, hash: sign(fields) }, TOKEN, now), 42)
  })
  it("a changed field, another bot's token, or a stale login are refused", () => {
    const hash = sign(fields)
    assert.equal(verifyTelegramLogin({ ...fields, id: 43, hash }, TOKEN, now), null)
    assert.equal(verifyTelegramLogin({ ...fields, hash }, "987:other", now), null)
    assert.equal(verifyTelegramLogin({ ...fields, hash }, TOKEN, now + 3600), null)
    assert.equal(verifyTelegramLogin({ ...fields, hash: "zz" }, TOKEN, now), null)
    assert.equal(verifyTelegramLogin(null, TOKEN, now), null)
  })
  it("fields Telegram didn't send are not part of the check; unknown extra fields are ignored", () => {
    assert.equal(verifyTelegramLogin({ ...fields, last_name: "", extra: "x", hash: sign(fields) }, TOKEN, now), 42)
  })
  it("the bot id is the token's numeric prefix", () => {
    assert.equal(botIdFromToken(TOKEN), "123456789")
    assert.equal(botIdFromToken(undefined), null)
  })
})
