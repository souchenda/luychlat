// The home header on a phone (founder, 18/10/2026): «អស្សាឡាមុអាឡៃកុមក៍, [ឈ្មោះ]» and the Hijri badge shared one
// row and cut each other to «…» at 360–390 px. Now: the greeting alone on a full-width line (wraps, never cut),
// then the short date and the pill on a wrapping row.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { headerDate } from "../src/lib/dates"
import { headerBadge } from "../src/lib/islamic"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const header = home.slice(home.indexOf("<header>"), home.indexOf("</header>"))

describe("Home header — greeting on its own line, never «…»", () => {
  it("the greeting is a full-width block that wraps (no truncate)", () => {
    const h1 = header.slice(header.indexOf('<h1 className="block w-full'), header.indexOf("</h1>", header.indexOf('<h1 className="block w-full')))
    assert.match(h1, /className="block w-full break-words/)
    assert.doesNotMatch(h1, /truncate/)
  })
  it("the date and the pill share a wrapping row under it", () => {
    assert.match(header, /<div className="mt-1 flex flex-wrap items-center justify-between gap-2">/)
    assert.ok(header.indexOf("</h1>") < header.indexOf("flex flex-wrap items-center justify-between gap-2"))
    assert.match(header, /\{headerDate\(today, locale\)\}/)
    assert.doesNotMatch(header, /max-w-\[58%\]/)
  })
  it("the short date: «ថ្ងៃអាទិត្យ ទី១៨ តុលា»", () => {
    assert.equal(headerDate(new Date(2026, 9, 18, 12), "km"), "ថ្ងៃអាទិត្យ ទី១៨ តុលា")
    assert.equal(headerDate(new Date(2026, 9, 18, 12), "en"), "Sunday, 18 October")
  })
  it("the Hijri badge without «ហ.ស.»: «🌙 ៧ ជុម៉ាដាល់អូឡា ១៤៤៨»", () => {
    assert.deepEqual(headerBadge({ islamic: true, hijri: { day: 7, month: 5, year: 1448 }, locale: "km" }), { kind: "hijri", text: "🌙 ៧ ជុម៉ាដាល់អូឡា ១៤៤៨" })
  })
})
