import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Wallet } from "@/lib/data/types"
import { restorePrefs, usePrefsStore } from "@/stores/prefs-store"

import { filterByTab, heroTotals, primaryWalletId, ringArcs, walletKind, walletMix } from "./wallet-overview"

const w = (id: string, over: Partial<Wallet> = {}): Wallet => ({
  id,
  workspace_id: "ws",
  name: id,
  balance: 0,
  currency: "USD",
  icon: "aba",
  color: null,
  sort_order: 0,
  archived_at: null,
  created_at: "2026-10-01T00:00:00Z",
  visibility: "SHARED",
  owner_id: null,
  ...over,
})

const cash = w("cash", { icon: "cash", name: "សាច់ប្រាក់សុទ្ធ", currency: "KHR" })
const aba = w("aba", { name: "ABA Mobile" })
const named = w("named", { icon: "other", name: "ACLEDA Toanchet" })
const card = w("card", { kind: "CREDIT_CARD", balance: -120 })
const goal = w("goal", { icon: "car", goal_target: 5000 })
const pool = w("pool", { icon: "pool_tontine" })
const archived = w("old", { archived_at: "2026-10-10T00:00:00Z" })

describe("wallet overview — the hero ring, the accent bars and the tabs (founder, 21/10/2026)", () => {
  it("each wallet's kind: cash in hand, a bank (also an «Other» named after one), a credit card, a savings goal", () => {
    assert.equal(walletKind(cash), "cash")
    assert.equal(walletKind(aba), "bank")
    assert.equal(walletKind(named), "bank")
    assert.equal(walletKind(card), "card")
    assert.equal(walletKind(goal), "savings")
  })

  it("the ring counts what the total counts: active wallets and goals, never an archived one or a shared pool's", () => {
    assert.deepEqual(walletMix([cash, aba, named, card, goal, pool, archived]), { total: 5, cash: 1, bank: 2, card: 1, savings: 1 })
    assert.deepEqual(walletMix([]), { total: 0, cash: 0, bank: 0, card: 0, savings: 0 })
  })

  it("the ring's arcs fill the circle in kind order, a gap between kinds, one whole ring for a single kind", () => {
    const C = 100
    const arcs = ringArcs(walletMix([cash, aba, named, goal]), C, 2)
    assert.deepEqual(arcs.map((a) => a.kind), ["cash", "bank", "savings"])
    assert.deepEqual(arcs.map((a) => a.offset), [0, 25, 75])
    assert.deepEqual(arcs.map((a) => a.length), [23, 48, 23])
    assert.deepEqual(ringArcs(walletMix([aba, named]), C, 2), [{ kind: "bank", length: 100, offset: 0 }])
    assert.deepEqual(ringArcs(walletMix([]), C), [])
  })

  it("the tabs: All everything; Bank the banks, e-wallets and their cards; Cash the cash in hand", () => {
    const list = [cash, aba, named, card]
    assert.deepEqual(filterByTab(list, "all"), list)
    assert.deepEqual(filterByTab(list, "bank").map((x) => x.id), ["aba", "named", "card"])
    assert.deepEqual(filterByTab(list, "cash").map((x) => x.id), ["cash"])
  })

  it("the primary wallet (ចម្បង) is the first in the person's order a new entry starts with", () => {
    assert.equal(primaryWalletId([aba, cash], "me"), "aba")
    // Archived, a goal or someone else's personal wallet is never the primary.
    const theirs = w("theirs", { visibility: "PERSONAL", owner_id: "someone" })
    assert.equal(primaryWalletId([archived, goal, theirs, cash], "me"), "cash")
    assert.equal(primaryWalletId([w("mine", { visibility: "PERSONAL", owner_id: "me" }), cash], "me"), "mine")
    assert.equal(primaryWalletId([], "me"), null)
  })

  it("the eye toggle shows and hides, and every launch starts hidden whatever was left (golden path 4)", () => {
    const store = usePrefsStore
    store.setState({ hideBalances: true })
    store.getState().toggleHideBalances()
    assert.equal(store.getState().hideBalances, false)
    store.getState().toggleHideBalances()
    assert.equal(store.getState().hideBalances, true)
    assert.equal(restorePrefs({ hideBalances: false }, store.getInitialState()).hideBalances, true)
  })

  it("the hero's figures: the total in dollars, the same total in riel (100 ៛ rounding when converted), the net after loans", () => {
    const usd = w("u", { balance: 1000.25 })
    const riel = w("r", { icon: "cash", currency: "KHR", balance: 401_250 })
    const t = heroTotals([usd, riel, pool, archived], 4010, 0, 300)
    assert.equal(t.totalUsd, 1100.31) // 1000.25 + 401,250 ៛ ÷ 4,010
    assert.equal(t.totalKhr, 4_412_300) // 401,250 + 1000.25 × 4,010 = 4,412,252.5 → 4,412,300 (roundRiel)
    assert.equal(t.totalKhr % 100, 0)
    assert.equal(t.net, 800.31)
    assert.equal(t.liabilities, 300)
    // Held only in riel: the exact sum, never rounded (an amount the person typed).
    assert.equal(heroTotals([riel], 4010).totalKhr, 401_250)
    // Assets count in dollars, so the riel line converts them too.
    assert.equal(heroTotals([riel], 4000, 50).totalKhr, 601_300)
  })
})
