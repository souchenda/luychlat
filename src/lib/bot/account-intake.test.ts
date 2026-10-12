import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { accountIntakeButtons, accountIntakeText, isAccountCallback, parseAccountCallback, parseGoalTarget, type AccountIntake } from "./account-intake"

const KMENG: AccountIntake = { name: "Chip Mong Bank · Kmeng Chhlat", bank: "Chip Mong Bank", accountName: "Kmeng Chhlat", accountNo: "0102 3456 789", balance: 1250.5, currency: "USD" }
const ID = "3f2b8c1e-5d4a-4b6c-9e8f-1a2b3c4d5e6f"

describe("bot account intake — the question", () => {
  it("«រកឃើញគណនីសន្សំ Chip Mong Bank Kmeng Chhlat $1,250.50!» when the chat shows numbers", () => {
    const t = accountIntakeText(KMENG, true)
    assert.match(t.split("\n")[0], /^🏦 រកឃើញគណនីសន្សំ Chip Mong Bank Kmeng Chhlat \$1,250\.50!$/)
    assert.match(t, /តើចង់កត់ត្រាចូលកាបូប ឬគោលដៅសន្សំ\?/)
    assert.match(t, /🔢 លេខគណនី៖ 0102 3456 789/)
  })
  it("the balance masked (••••) when the chat did not turn on «ឱ្យ AI មើលលេខ» — the bot privacy rule", () => {
    const t = accountIntakeText(KMENG, false)
    assert.match(t.split("\n")[0], /Kmeng Chhlat ••••!$/)
    assert.doesNotMatch(t, /1,250/)
  })
  it("no balance on the screen: no amount at all", () => {
    assert.match(accountIntakeText({ ...KMENG, balance: null }, true).split("\n")[0], /Kmeng Chhlat!$/)
  })
})

describe("bot account intake — one tap", () => {
  it("👛 wallet / 🎯 goal / ✖️, each under 64 bytes of callback data", () => {
    const rows = accountIntakeButtons(ID).inline_keyboard.flat()
    assert.deepEqual(rows.map((b) => b.text), ["👛 កាបូប", "🎯 គោលដៅសន្សំ", "✖️ ទេ អរគុណ"])
    for (const b of rows) {
      assert.ok(Buffer.byteLength(b.callback_data) <= 64)
      assert.ok(isAccountCallback(b.callback_data))
    }
    assert.deepEqual(parseAccountCallback(`ac:${ID}:w`), { id: ID, action: "wallet" })
    assert.deepEqual(parseAccountCallback(`ac:${ID}:g`), { id: ID, action: "goal" })
    assert.deepEqual(parseAccountCallback(`ac:${ID}:x`), { id: ID, action: "dismiss" })
    assert.equal(parseAccountCallback("ac:not-a-uuid:w"), null)
  })
  it("the goal amount typed back: 5000, 5,000, ៥០០០, $5000, 20000000៛; never 0, text or a negative", () => {
    assert.equal(parseGoalTarget("5000"), 5000)
    assert.equal(parseGoalTarget("5,000"), 5000)
    assert.equal(parseGoalTarget("៥០០០"), 5000)
    assert.equal(parseGoalTarget("$5000"), 5000)
    assert.equal(parseGoalTarget("20000000៛"), 20_000_000)
    assert.equal(parseGoalTarget("1500.50"), 1500.5)
    assert.equal(parseGoalTarget("0"), null)
    assert.equal(parseGoalTarget("-5"), null)
    assert.equal(parseGoalTarget("ប្រហែល ៥០០០"), null)
  })
})
