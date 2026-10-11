import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseTgAuthResult, telegramAuthUrl } from "./telegram-auth-result"

const enc = (o: object) => Buffer.from(JSON.stringify(o), "utf8").toString("base64")

describe("Telegram redirect sign-in — #tgAuthResult", () => {
  const user = { id: 42, first_name: "ចិន្តា", username: "tester", auth_date: 1_800_000_000, hash: "ab".repeat(32) }
  it("decodes the signed fields (Khmer names too), standard or URL-safe base64", () => {
    assert.deepEqual(parseTgAuthResult(`#tgAuthResult=${enc(user)}`), user)
    const urlSafe = enc(user).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    assert.deepEqual(parseTgAuthResult(`#tgAuthResult=${urlSafe}`), user)
  })
  it("nothing, garbage or data without a hash → null", () => {
    assert.equal(parseTgAuthResult(""), null)
    assert.equal(parseTgAuthResult("#tgAuthResult=@@@"), null)
    assert.equal(parseTgAuthResult(`#tgAuthResult=${enc({ id: 1 })}`), null)
  })
  it("Telegram's page for the bot, back to /login", () => {
    assert.equal(
      telegramAuthUrl("8852687301", "https://app.luychlat.com", "https://app.luychlat.com/login"),
      "https://oauth.telegram.org/auth?bot_id=8852687301&origin=https%3A%2F%2Fapp.luychlat.com&request_access=write&return_to=https%3A%2F%2Fapp.luychlat.com%2Flogin",
    )
  })
})
