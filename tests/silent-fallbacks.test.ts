// Silent-fallback audit (founder, 14/10/2026): each fix here is locked so the silent path can't return.
// Where the behaviour lives in a UI component or a bot handler (hard to run in a unit test), the guard
// checks the code itself for the exact pattern that was removed.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { shouldAnnounceQueryError } from "../src/lib/query-client"

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8")

describe("silent fallbacks — fixed and locked", () => {
  it("a query that fails before it loaded is announced (never a silent «no wallets» / «not found»); a background refresh failure stays quiet", () => {
    assert.equal(shouldAnnounceQueryError(false), true)
    assert.equal(shouldAnnounceQueryError(true), false)
    assert.match(src("lib/query-client.ts"), /new QueryCache\(\{\s*onError/)
  })
  it("only core data raises the global warning; a side widget failing never covers a loaded dashboard, and the warning goes once core data loads (founder, 14/10/2026)", () => {
    for (const key of ["wallets", "transactions", "workspaces", "debts", "categories"]) assert.equal(shouldAnnounceQueryError(false, [key, "s", "w"]), true, key)
    for (const key of ["goal-cover", "profile-image", "market-prices", "gold-rates", "daily-tips", "morning-published", "kscore"]) assert.equal(shouldAnnounceQueryError(false, [key]), false, key)
    assert.equal(shouldAnnounceQueryError(true, ["wallets"]), false)
    assert.match(src("lib/query-client.ts"), /onSuccess:[\s\S]{0,160}toast\.dismiss\("query-error"\)/)
  })
  it("bank-alert Undo: a failed call is reported as a failure, never «already removed»", () => {
    assert.match(src("lib/server/bank-alert-bot.ts"), /const \{ data, error \} = await botDb\(\)\.rpc\("bot_bank_undo"[\s\S]{0,200}if \(error \|\| !data\)/)
  })
  it("pool posts are marked seen only once the group really received them", () => {
    const pool = src("lib/server/pool-bot.ts")
    assert.match(pool, /if \(!\(sent as \{ ok\?: boolean \}\)\.ok\) delivered = false/)
    assert.match(pool, /if \(!delivered\) \{[\s\S]{0,200}continue[\s\S]{0,120}bot_pool_posted/)
  })
  it("a scanned bill statement that fails to save is said (no swallowed .catch)", () => {
    const sheet = src("components/bills/bill-sheet.tsx")
    assert.doesNotMatch(sheet, /addStatement\.mutateAsync\([^)]*\)\)?\.catch\(\(\) => null\)/)
    assert.match(sheet, /bills\.savedNoStatement/)
  })
  it("money sheets never default to «no wallet» just because wallets were still loading", () => {
    assert.match(src("components/debts/repayment-sheet.tsx"), /untouched[\s\S]{0,200}setValue\("moveMoney", true\)/)
    assert.match(src("components/tontine/tontine-round-sheet.tsx"), /walletTouched \|\| walletId !== NONE \|\| !active\.length/)
    assert.match(src("app/(app)/bills/page.tsx"), /!walletTouched && walletId === NO_WALLET && firstWallet/)
  })
  it("«clc paid» with no wallet to pay from says so — not «no amount»", () => {
    assert.match(src("lib/server/bot-commands.ts"), /if \(paid && !wallet\) return reply\(tr\(lang, "bot\.cmdNoWallet"\)\)/)
  })
  it("closing / reopening a tontine reports a failure", () => {
    assert.match(src("lib/data/hooks.ts"), /setClosed: useMutation\(\{[\s\S]{0,250}onError/)
  })
})
