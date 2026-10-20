import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { POPULAR_PROVIDERS, providerHasCards } from "./providers"

const form = readFileSync(join(process.cwd(), "src/components/wallets/wallet-form-sheet.tsx"), "utf8")

describe("Cash is never a credit card — the add-wallet form (founder, 20/10/2026)", () => {
  it("cash has no card choice; banks and e-wallets keep it", () => {
    assert.equal(providerHasCards("cash"), false)
    assert.equal(providerHasCards(undefined), false) // a new wallet starts as cash
    for (const key of POPULAR_PROVIDERS.filter((k) => k !== "cash")) assert.equal(providerHasCards(key), true, key)
    assert.equal(providerHasCards("other"), true)
  })
  it("regression: «ប្រភេទ» [ កាបូបធម្មតា | 💳 ប័ណ្ណឥណទាន ] showed for «សាច់ប្រាក់សុទ្ធ» — the row is hidden and the wallet saved standard", () => {
    assert.match(form, /const cardable = providerHasCards\(icon\)/)
    assert.match(form, /\{!wallet && cardable && \(\s*<div className="space-y-2" data-testid="wallet-type-row">/)
    assert.match(form, /if \(!cardable && getValues\("kind"\) !== "STANDARD"\) setValue\("kind", "STANDARD"\)/)
    assert.match(form, /const isCardForm = values\.kind === "CREDIT_CARD" && providerHasCards\(values\.icon\)/)
  })
})
