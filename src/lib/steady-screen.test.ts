import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

// Founder, 29/10/2026: on iPhone the screen slid sideways and zoomed in — «make it fixed like an app».
describe("the screen stays put on a phone, like an app", () => {
  it("no zoom: the viewport is fixed at 1", () => {
    const layout = read("src/app/layout.tsx")
    assert.match(layout, /maximumScale: 1/)
    assert.match(layout, /userScalable: false/)
  })
  it("no sideways drift, no page bounce, no double-tap zoom, no zoom into a small field", () => {
    const css = read("src/app/globals.css")
    assert.match(css, /overflow-x: clip;/)
    assert.match(css, /overscroll-behavior: none;/)
    assert.match(css, /touch-action: manipulation;/)
    assert.match(css, /font-size: max\(16px, 1em\) !important;/)
  })
})
