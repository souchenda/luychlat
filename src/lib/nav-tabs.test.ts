import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { rightTabs } from "./nav-tabs"

describe("1-tap Islamic hub (founder, 19/10/2026)", () => {
  it("Islamic Mode on: the 5th tab is «ឥស្លាម» → /islamic; off: the AI advisor, unchanged", () => {
    assert.deepEqual(rightTabs(true).map((t) => [t.href, t.label]), [["/reports", "reports.title"], ["/islamic", "nav.islamic"]])
    assert.deepEqual(rightTabs(false).map((t) => [t.href, t.label]), [["/reports", "reports.title"], ["/advisor", "nav.advisor"]])
    assert.equal(dictionaries.km["nav.islamic"], "ឥស្លាម")
  })
  it("the bottom bar reads Islamic Mode; the Hijri badge and the next-prayer chip open /islamic", () => {
    const nav = readFileSync(join(process.cwd(), "src/components/layout/bottom-nav.tsx"), "utf8")
    // Not in a Business workspace (founder, 28/10/2026 — the business menu has no Islamic tools).
    assert.match(nav, /rightTabs\(islamicOn && workspace\?\.type !== "BUSINESS"\)/)
    const home = readFileSync(join(process.cwd(), "src/app/(app)/home/page.tsx"), "utf8")
    assert.match(home, /badge\.kind === "hijri" \? \(\s*<Link\s+href="\/islamic"/)
    assert.match(home, /<NextPrayerChip \/>/)
    const chip = readFileSync(join(process.cwd(), "src/components/islamic/next-prayer-chip.tsx"), "utf8")
    assert.match(chip, /if \(!islamic\) return null/)
    assert.match(chip, /href="\/islamic"/)
  })
})
