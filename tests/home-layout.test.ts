// The home dashboard's layout (founder, 17/10/2026): the NBC / gold ticker is one full-width line UNDER the
// total card — once it was dropped inside the card's quick-action fragment and rendered as a squeezed fourth
// cell over the card («NBC», «មាស», «/», «តម្លឹង» stacked one syllable per line).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const ticker = readFileSync(join(process.cwd(), "src", "components", "dashboard", "market-rates-card.tsx"), "utf8")

describe("home — the market ticker sits under the card, on one line", () => {
  it("is rendered after the NetWorthCard element has closed, never inside its actions", () => {
    const card = home.indexOf("<NetWorthCard")
    const actions = home.indexOf("actions={", card)
    const cardEnd = home.indexOf("\n      />", actions)
    const at = home.indexOf("<MarketRatesCard />")
    assert.ok(card > 0 && actions > card && cardEnd > actions && at > 0)
    assert.ok(at > cardEnd, "MarketRatesCard must come after the NetWorthCard closes")
    assert.doesNotMatch(home.slice(card, cardEnd), /MarketRatesCard/)
    assert.doesNotMatch(home.slice(card, cardEnd), /footer=/)
  })
  it("is one full-width row that never wraps", () => {
    assert.match(ticker, /w-full flex-row items-center/)
    assert.match(ticker, /whitespace-nowrap/)
    assert.doesNotMatch(ticker, /flex-wrap/)
  })
})
