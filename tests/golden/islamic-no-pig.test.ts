// GOLDEN GUARD — no pig imagery (founder, 21/10/2026: «In Islam, swine are strictly forbidden — displaying a pig icon when
// Islamic Mode is enabled is religiously inappropriate»). The «គោលដៅសន្សំ» quick action drew a piggy bank. Islamic Mode
// users see the dashboard, the goals, the tips, the categories and the bot, so the app draws no pig anywhere: a target for
// the goals, a vault for saving. The stored category key «piggy-bank» stays (existing data) and draws a vault.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import * as React from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { quickActions } from "@/lib/quick-actions"

type Grid = typeof import("@/components/dashboard/quick-actions").QuickActionGrid
type Icons = typeof import("@/lib/categories/icons").CATEGORY_ICONS
let QuickActionGrid: Grid
let CATEGORY_ICONS: Icons
before(async () => {
  // The components compile to classic React.createElement under the test runner.
  ;(globalThis as { React?: typeof React }).React = React
  ;({ QuickActionGrid } = await import("@/components/dashboard/quick-actions"))
  ;({ CATEGORY_ICONS } = await import("@/lib/categories/icons"))
})

/** Pig emoji (🐷 🐖 🐽 🐗) and the piggy-bank icon, as a component, an SVG class or a name. */
const PIG = /🐷|🐖|🐽|🐗|PiggyBank|lucide-piggy-bank|piggy[\s_]?bank/i

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(tsx?|css|json)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
  )

describe("GOLDEN · no pig imagery — Islamic Mode (founder, 21/10/2026)", () => {
  const grid = (islamic: boolean) =>
    renderToStaticMarkup(
      createElement(QuickActionGrid, {
        actions: quickActions({ editable: true, personal: true, islamic, walletCount: 3 }),
        onEntry: () => {},
        onTransfer: () => {},
      }),
    )

  it("with Islamic Mode on, the savings-goals tile draws a target — never a pig (SVG, class or emoji)", () => {
    const html = grid(true)
    assert.match(html, /href="\/goals"[\s\S]*?lucide-target/, "the goals tile draws the target icon")
    assert.doesNotMatch(html, PIG)
    assert.match(html, /href="\/islamic"/) // and it is the Islamic grid
  })

  it("the general grid draws no pig either", () => {
    assert.doesNotMatch(grid(false), PIG)
  })

  it("the category key «piggy-bank» (existing data) draws a vault", () => {
    const html = renderToStaticMarkup(createElement(CATEGORY_ICONS["piggy-bank"]))
    assert.match(html, /lucide-vault/)
    assert.doesNotMatch(html, /lucide-piggy/)
  })

  it("no source file in the app draws a pig: no PiggyBank icon, no pig emoji", () => {
    const offenders = walk(join(process.cwd(), "src"))
      .map((f) => [f, readFileSync(f, "utf8").replace(/"piggy-bank"/g, '"<stored key>"')] as const)
      .filter(([, src]) => PIG.test(src))
      .map(([f]) => f)
    assert.deepEqual(offenders, [])
  })
})
