// The home dashboard's hero card (founder, 17/10/2026): balance on the left, the three quick actions stacked
// on the right, and the NBC / gold ticker as ONE slim line in the card's footer. Once the ticker was dropped
// inside the quick-action fragment and rendered as a squeezed cell over the card («NBC», «មាស», «/», «តម្លឹង»
// stacked one syllable per line) — never again.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const card = readFileSync(join(process.cwd(), "src", "components", "wallets", "net-worth-card.tsx"), "utf8")
const ticker = readFileSync(join(process.cwd(), "src", "components", "dashboard", "market-rates-card.tsx"), "utf8")

describe("home — the hero card's layout", () => {
  it("the ticker is the card's footer, never inside the quick actions", () => {
    assert.match(home, /footer=\{<MarketRatesCard \/>\}/)
    const actions = home.indexOf("actions={")
    const actionsEnd = home.indexOf("</>", actions)
    assert.ok(actions > 0 && actionsEnd > actions)
    assert.doesNotMatch(home.slice(actions, actionsEnd), /MarketRatesCard/)
    assert.equal(home.match(/<MarketRatesCard/g)?.length, 1)
  })
  it("the actions stay stacked on the right of the balance; the ticker is one line that never wraps", () => {
    assert.match(card, /\{actions && <div className="flex w-\[[\d.]+rem\] shrink-0 flex-col justify-center gap-2">\{actions\}<\/div>\}/)
    assert.match(ticker, /flex w-full flex-row items-center/)
    assert.match(ticker, /whitespace-nowrap/)
    assert.doesNotMatch(ticker, /flex-wrap/)
  })
  it("the K-Score (the person's own) shows on the Personal home only — never in a business or family workspace", () => {
    assert.match(home, /\{workspace\?\.type === "PERSONAL" && <KScoreHomeCard \/>\}/)
    assert.equal(home.match(/<KScoreHomeCard/g)?.length, 1)
  })
})
