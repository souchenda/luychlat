// GOLDEN GUARD — the home hero card stays the hero card (founder, 18/10/2026). d2cb721 put the spending
// pulse and the smart hub INSIDE the hero card's action column: squashed to ~100 px, Khmer overlapping, the
// green card stretched. The hero holds only the balance (left), the three stacked actions (right) and the
// one-line NBC / gold ticker (bottom); every dashboard section is a full-width sibling BELOW it.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")

/** The JSX of one prop of <NetWorthCard …> — `name={ … }` by brace matching. */
function prop(name: string): string {
  const card = home.indexOf("<NetWorthCard")
  assert.ok(card >= 0, "the home page renders <NetWorthCard>")
  const start = home.indexOf(`${name}={`, card)
  assert.ok(start > card, `<NetWorthCard ${name}={…}> found`)
  let depth = 0
  for (let i = start + name.length + 1; i < home.length; i++) {
    if (home[i] === "{") depth++
    else if (home[i] === "}" && --depth === 0) return home.slice(start, i + 1)
  }
  throw new Error(`${name} prop not closed`)
}

/** The component tags used inside a JSX snippet (capitalised names; fragments skipped). */
const tags = (jsx: string) => [...new Set([...jsx.matchAll(/<([A-Z][A-Za-z0-9.]*)/g)].map((m) => m[1]))]

describe("GOLDEN 7b · layout guards — the home hero card", () => {
  it("the hero's action column holds only the three stacked actions (+ ចំណូល, − ចំណាយ, ⇆ ផ្ទេរប្រាក់)", () => {
    const actions = prop("actions")
    assert.deepEqual(tags(actions), ["HeroAction"], `only <HeroAction> may sit in the hero's action column, found: ${tags(actions).join(", ")}`)
    assert.equal([...actions.matchAll(/<HeroAction\b/g)].length, 3)
  })
  it("the hero's footer is only the one-line NBC / gold ticker", () => {
    assert.deepEqual(tags(prop("footer")), ["MarketRatesCard"])
  })
  it("the spending pulse and the smart hub are full-width siblings BELOW the hero card, never inside it", () => {
    const heroEnd = home.indexOf("/>", home.indexOf(prop("actions")) + prop("actions").length)
    for (const name of ["SpendingTrendCard", "SmartHub"]) {
      const at = home.indexOf(`<${name}`)
      assert.ok(at > heroEnd, `<${name}> must come after the hero card closes`)
    }
  })
})
