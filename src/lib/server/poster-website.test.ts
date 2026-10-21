// Every poster shows the web app's own address (founder, 21/10/2026 — Task #431: the footer read the bare «luychlat.com»).
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { POSTER_WEBSITE } from "./poster-kit"

const dir = join(process.cwd(), "src", "lib", "server")
const posters = readdirSync(dir).filter((f) => /poster|poster-kit|pool-card|reels-frames/.test(f) && !f.includes(".test."))
/** The code without its comments. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/.*$/gm, "$1")

describe("posters show «app.luychlat.com», never the bare «luychlat.com»", () => {
  it("the shared footer draws the web app's address", () => {
    assert.equal(POSTER_WEBSITE, "app.luychlat.com")
    assert.match(code(readFileSync(join(dir, "poster-kit.ts"), "utf8")), /ctx\.fillText\(POSTER_WEBSITE, x \+ 44, line2\)/)
  })
  it("no poster engine writes the bare domain", () => {
    assert.ok(posters.length >= 8, posters.join(", "))
    const bare = posters.filter((f) => /(?<![./\w])luychlat\.com/.test(code(readFileSync(join(dir, f), "utf8"))))
    assert.deepEqual(bare, [])
  })
})
