import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { restorePrefs, usePrefsStore } from "./prefs-store"

describe("balances are private by default (founder, 13/10/2026)", () => {
  it("a fresh launch starts hidden", () => {
    assert.equal(usePrefsStore.getInitialState().hideBalances, true)
  })
  it("a device that saved «shown» still launches hidden; other preferences come back as saved", () => {
    const restored = restorePrefs({ hideBalances: false, walletsGrouped: false, khrPerUsd: 4050 }, usePrefsStore.getInitialState())
    assert.equal(restored.hideBalances, true)
    assert.equal(restored.walletsGrouped, false)
    assert.equal(restored.khrPerUsd, 4050)
  })
  it("the eye toggles; the guard's reset hides again", () => {
    usePrefsStore.getState().toggleHideBalances()
    assert.equal(usePrefsStore.getState().hideBalances, false)
    usePrefsStore.getState().setHideBalances(true)
    assert.equal(usePrefsStore.getState().hideBalances, true)
  })
})
