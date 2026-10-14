// GOLDEN PATH 4 — Privacy by default (balances hidden on launch; the bot never leaks numbers).
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { accountIntakeText } from "../../src/lib/bot/account-intake"
import { formatMoney, HIDDEN_AMOUNT } from "../../src/lib/money"
import { restorePrefs, usePrefsStore } from "../../src/stores/prefs-store"

describe("GOLDEN 4 · privacy by default", () => {
  it("every launch starts hidden — even on a device that saved «shown»", () => {
    assert.equal(usePrefsStore.getInitialState().hideBalances, true)
    assert.equal(restorePrefs({ hideBalances: false }, usePrefsStore.getInitialState()).hideBalances, true)
  })
  it("a hidden amount shows ***** and never a digit", () => {
    for (const shown of [formatMoney(1250.5, "USD", { hidden: true }), formatMoney(50_000, "KHR", { hidden: true })]) {
      assert.ok(shown.includes(HIDDEN_AMOUNT), shown)
      assert.doesNotMatch(shown, /\d/)
    }
  })
  it("the bot masks a screenshot's balance unless the chat turned on «ឱ្យ AI មើលលេខ»", () => {
    const a = { name: "Amret · Kmeng Chhlat", bank: "Amret", accountName: "Kmeng Chhlat", accountNo: null, balance: 1250.5, currency: "USD" as const }
    assert.doesNotMatch(accountIntakeText(a, false), /1,250/)
  })
})
