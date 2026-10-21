// The home dashboard's hero card (founder, 17/10/2026; the ACLEDA layout 21/10/2026): the wallet ring and the totals
// across the card — no buttons inside, the quick-action grid below is the one place for actions — and the NBC / gold
// ticker as ONE slim line in the card's footer. Once the ticker was dropped inside the old stacked quick actions and
// rendered as a squeezed cell over the card («NBC», «មាស», «/», «តម្លឹង» stacked one syllable per line) — never again.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const card = readFileSync(join(process.cwd(), "src", "components", "wallets", "net-worth-card.tsx"), "utf8")
const ticker = readFileSync(join(process.cwd(), "src", "components", "dashboard", "market-rates-card.tsx"), "utf8")

describe("home — the hero card's layout", () => {
  it("the ticker is the card's footer, once — never inside the quick actions", () => {
    assert.match(home, /footer=\{<MarketRatesCard \/>\}/)
    assert.equal(home.match(/<MarketRatesCard/g)?.length, 1)
    assert.doesNotMatch(home.slice(home.indexOf("<QuickActionGrid"), home.indexOf("/>", home.indexOf("<QuickActionGrid"))), /MarketRatesCard/)
  })
  it("the wallet ring sits left of the totals with nothing stacked on the right; the ticker is one line that never wraps", () => {
    assert.match(card, /\{!loading && <WalletRing wallets=\{wallets \?\? \[\]\} \/>\}\s*<div className="min-w-0 flex-1">/)
    assert.doesNotMatch(card, /flex-col justify-center gap-2/)
    assert.match(ticker, /flex w-full flex-row items-center/)
    assert.match(ticker, /whitespace-nowrap/)
    assert.doesNotMatch(ticker, /flex-wrap/)
  })
  it("the K-Score (the person's own) shows on the Personal home only — never in a business or family workspace", () => {
    assert.match(home, /<SmartHub workspaceId=\{ws\} personal=\{workspace\?\.type === "PERSONAL"\} \/>/)
    const hub = readFileSync(join(process.cwd(), "src", "components", "dashboard", "smart-hub.tsx"), "utf8")
    assert.match(hub, /const score = personal \? kscore : null/)
  })
})
