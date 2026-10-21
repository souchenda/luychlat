// GOLDEN GUARD — the home hero card stays the hero card. 18/10/2026: d2cb721 put the spending pulse and the smart hub
// INSIDE the hero card's action column (squashed to ~100 px, Khmer overlapping, the green card stretched), so every
// dashboard section is a full-width sibling BELOW it. 21/10/2026 (founder — the ACLEDA layout): the three stacked buttons
// left the hero too; the 3×3 quick-action grid right below it is the one place for actions. The hero holds only the
// wallet ring, the totals (eye toggle, USD / KHR, loans and net) and the one-line NBC / gold ticker.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const card = readFileSync(join(process.cwd(), "src", "components", "wallets", "net-worth-card.tsx"), "utf8")

/** The <NetWorthCard …/> element on the home page. */
function hero(): string {
  const start = home.indexOf("<NetWorthCard")
  assert.ok(start >= 0, "the home page renders <NetWorthCard>")
  return home.slice(start, home.indexOf("/>\n", start) + 2)
}

/** The JSX of one prop of <NetWorthCard …> — `name={ … }` by brace matching. */
function prop(name: string): string {
  const jsx = hero()
  const start = jsx.indexOf(`${name}={`)
  assert.ok(start > 0, `<NetWorthCard ${name}={…}> found`)
  let depth = 0
  for (let i = start + name.length + 1; i < jsx.length; i++) {
    if (jsx[i] === "{") depth++
    else if (jsx[i] === "}" && --depth === 0) return jsx.slice(start, i + 1)
  }
  throw new Error(`${name} prop not closed`)
}

/** The component tags used inside a JSX snippet (capitalised names; fragments skipped). */
const tags = (jsx: string) => [...new Set([...jsx.matchAll(/<([A-Z][A-Za-z0-9.]*)/g)].map((m) => m[1]))]

describe("GOLDEN 7b · layout guards — the home hero card", () => {
  it("no buttons inside the hero (founder, 21/10/2026): no action column, no «+ ចំណូល / − ចំណាយ / ⇆ ផ្ទេរប្រាក់»", () => {
    assert.doesNotMatch(hero(), /\bactions=/, "the hero takes no actions")
    assert.doesNotMatch(card, /\bactions\??:|\bactions\s*[,}]|HeroAction/, "the card has no action column (no `actions` prop, no HeroAction)")
    // Its only buttons are the eye toggle and «retry» for an asset it could not count.
    assert.equal([...card.matchAll(/<button\b/g)].length, 2)
  })
  it("the hero's footer is only the one-line NBC / gold ticker", () => {
    assert.deepEqual(tags(prop("footer")), ["MarketRatesCard"])
  })
  it("the quick-action grid, the spending pulse and the smart hub are full-width siblings BELOW the hero card, never inside it", () => {
    const heroEnd = home.indexOf(hero()) + hero().length
    const at = (name: string) => home.indexOf(`<${name}`)
    for (const name of ["QuickActionGrid", "SpendingTrendCard", "SmartHub"]) assert.ok(at(name) > heroEnd, `<${name}> must come after the hero card closes`)
    // The grid comes first, right under the card: the one place for actions.
    assert.ok(at("QuickActionGrid") < at("SpendingTrendCard") && at("QuickActionGrid") < at("SmartHub"))
  })
  it("income stays one tap away: the grid's entry tile opens a sheet that switches expense ⇄ income", () => {
    assert.match(home, /onEntry=\{\(\) => setEntryType\("EXPENSE"\)\}/)
    assert.match(home, /onTypeChange=\{setEntryType\}/)
  })
})
