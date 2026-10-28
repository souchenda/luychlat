import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { latinDigits } from "../src/lib/dates"
import { TIPS } from "../src/lib/tips"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
// Website/ is not in the Docker build context (.dockerignore): checked locally and before every push.
const here = existsSync(join(process.cwd(), "Website/index.html"))

describe("«គន្លឹះលុយខ្លីៗ» on luychlat.com — the app's own tips (founder, 28/10/2026)", { skip: !here && "Website/ is not in the build context" }, () => {
  const page = read("Website/index.html")
  const ids = [...page.matchAll(/data-i="tip\.([a-z0-9-]+)\.t"/g)].map((m) => m[1])
  it("six tips, each from src/lib/tips.ts word for word, with 0-9 digits", () => {
    assert.equal(ids.length, 6)
    for (const id of ids) {
      const tip = TIPS.find((t) => t.id === id)
      assert.ok(tip, id)
      assert.ok(page.includes(`data-i="tip.${id}.b">${latinDigits(tip!.body.km).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`), id)
    }
    const section = page.slice(page.indexOf("<!-- tips:start"), page.indexOf("<!-- tips:end"))
    assert.doesNotMatch(section, /[០-៩]/)
  })
  it("regression: «$10» survives the generator (a string replacement read «$1» as a group and printed «0»)", () => {
    assert.match(page, /សូម្បីតែ \$10/)
    assert.match(read("scripts/website-tips.ts"), /page\.replace\(block, \(\) => section\)/)
  })
  it("in English and Chinese too, and in the header menu", () => {
    const i18n = read("Website/i18n.js")
    assert.equal((i18n.match(/\/\/ tips:start/g) ?? []).length, 2)
    for (const id of ids) assert.match(i18n, new RegExp(`"tip\.${id}\.t": "`))
    assert.match(page, /<a href="#tips" data-i="nav\.tips">គន្លឹះ<\/a>/)
  })
})
