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
    assert.match(home, /footer=\{<MarketRatesCard workspaceType=\{workspace\?\.type\} \/>\}/) // fuel for a business (Task #438)
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
  it("compact, like ACLEDA (founder, 21/10/2026): the ring, then title + eye, riel on top and dollars below — no converted headline", () => {
    // Top: the ring beside the stack.
    assert.match(card, /<div className="flex items-center gap-4">\s*\{!loading && <WalletRing/)
    // What is held in each currency, riel first, each with its badge — the held sums, not a converted total.
    assert.match(card, /\(\["KHR", "USD"\] as const\)\.map/)
    assert.match(card, /c === "KHR" \? totals\.khrWallets : totals\.usdWallets/)
    // Gone: the big converted «$…» line and its «≈ …៛» twin.
    assert.doesNotMatch(card, /totals\.totalUsd|totals\.totalKhr|≈ <Amount/)
    const top = card.indexOf('<div className="flex items-center gap-4">')
    const row = card.indexOf("divide-x divide-white/15")
    const ticker = card.indexOf("{footer &&")
    assert.ok(top > 0 && row > top && ticker > row, "ring + stack, then the loans / assets / net row, then the ticker")
    // That row spans the card (a sibling of the top, not inside the stack): owed on the left, the net worth on the right —
    // two halves (three cells cut the amounts on a phone; the assets are a small line in the stack).
    const between = card.slice(top, card.lastIndexOf("<div", row))
    assert.equal(between.match(/<div\b/g)?.length, between.match(/<\/div>/g)?.length, "the top block is closed before the row")
    assert.doesNotMatch(card, /grid-cols-3/)
    assert.ok(card.indexOf("netWorth.assetsShort") < row && row < card.indexOf("netWorth.loans") && card.indexOf("netWorth.loans") < card.indexOf("netWorth.netShort"))
  })
  it("hairline borders (founder, 21/10/2026): the hero card and each of the nine squircles, in light and dark", () => {
    assert.match(card, /border border-emerald-400\/25 shadow-md shadow-emerald-950\/10 dark:border-emerald-500\/30 dark:shadow-none/)
    assert.doesNotMatch(card.slice(card.indexOf("<section"), card.indexOf(">", card.indexOf("<section"))), /ring-1/) // one border, not a ring too
    const grid = readFileSync(join(process.cwd(), "src", "components", "dashboard", "quick-actions.tsx"), "utf8")
    assert.match(grid, /border border-emerald-600\/15[^"]*shadow-sm[^"]*group-active:scale-95[^"]*dark:border-emerald-500\/20/)
    assert.match(grid, /"group flex min-h-\[5\.5rem\]/)
  })
})
