import assert from "node:assert/strict"
import { createCanvas } from "@napi-rs/canvas"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { FAMILIAR } from "../familiar"
import { FAMILIES, FRAME, loadFonts, wrap } from "./poster-kit"

// Regression (29/10/2026): eight «ធ្លាប់ទេ?» questions were cut to «…» on the poster's two headline lines.
describe("«ធ្លាប់ទេ?» poster headlines", () => {
  it("every question fits the tip poster's two lines (700 86px) — never cut with «…»", () => {
    // The same type as the poster itself (tip-poster.ts).
    const src = readFileSync(join(process.cwd(), "src/lib/server/tip-poster.ts"), "utf8")
    assert.ok(src.includes("ctx.font = `700 86px ${FAMILIES}`") && src.includes("wrap(ctx, tip.title, W - 2 * PAD, 2)"))
    loadFonts()
    const ctx = createCanvas(FRAME.W, FRAME.H).getContext("2d")
    ctx.font = `700 86px ${FAMILIES}`
    for (const f of FAMILIAR) {
      const lines = wrap(ctx, f.question, FRAME.W - 2 * FRAME.PAD, 2)
      assert.ok(!lines.some((l) => l.endsWith("…")), `${f.id}: ${lines.join(" / ")}`)
    }
  })
})
