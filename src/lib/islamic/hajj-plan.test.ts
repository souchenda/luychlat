import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, it } from "node:test"

import { GOAL_PRESETS } from "@/lib/goals"

import { findHajjGoal, HAJJ_DEFAULT_MONTHS, HAJJ_GOAL_ICON, HAJJ_GOAL_NAME, HAJJ_PACKAGES, hajjGoalInput, hajjPlan, hajjProgress, progressBlocks } from "./hajj-plan"

function sources(dir = join(process.cwd(), "src")): { path: string; src: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ path, src: readFileSync(path, "utf8") }] : []
  })
}

describe("«🕋 ផែនការសន្សំសម្រាប់ធ្វើរូកូន» — Hajj and Umrah savings (founder, 19/10/2026)", () => {
  it("presets: Hajj $5,000 (default), Umrah $2,000, or one's own; 3 years by default", () => {
    assert.deepEqual(HAJJ_PACKAGES.map((p) => [p.key, p.usd]), [["hajj", 5000], ["umrah", 2000]])
    assert.equal(HAJJ_DEFAULT_MONTHS, 36)
  })

  it("the monthly saving reaches the target (rounded up to the cent); riel to 100 ៛; daily over 365 days; SAR at 3.75", () => {
    const p = hajjPlan({ targetUsd: 5000, months: 36, usdKhr: 4070 })!
    assert.equal(p.monthlyUsd, 138.89) // 5000 / 36 = 138.888… → 138.89, so 36 × 138.89 ≥ 5000
    assert.ok(p.monthlyUsd * 36 >= 5000)
    assert.equal(p.monthlyKhr, 565_300) // 138.89 × 4070 = 565,282.3 → 565,300 ៛
    assert.equal(p.dailyUsd, 4.57) // 138.89 × 12 / 365
    assert.equal(p.targetSar, 18_750)
    assert.equal(p.targetKhr, 20_350_000)
    const umrah = hajjPlan({ targetUsd: 2000, months: 12, usdKhr: 4070 })!
    assert.equal(umrah.monthlyUsd, 166.67)
    assert.equal(umrah.targetSar, 7500)
  })

  it("what is already saved comes off; no rate → no riel guess; nonsense → no plan", () => {
    assert.equal(hajjPlan({ targetUsd: 5000, months: 10, savedUsd: 3000, usdKhr: 4070 })!.monthlyUsd, 200)
    assert.equal(hajjPlan({ targetUsd: 5000, months: 10, savedUsd: 6000, usdKhr: 4070 })!.monthlyUsd, 0) // reached
    const noRate = hajjPlan({ targetUsd: 5000, months: 36, usdKhr: 0 })!
    assert.equal(noRate.monthlyKhr, 0)
    assert.equal(noRate.targetKhr, 0)
    for (const bad of [{ targetUsd: 0, months: 12 }, { targetUsd: 5000, months: 0 }, { targetUsd: 5000, months: 1.5 }, { targetUsd: Number.NaN, months: 12 }]) {
      assert.equal(hajjPlan({ ...bad, usdKhr: 4070 }), null, JSON.stringify(bad))
    }
  })

  it("one tap creates the goal «សន្សំទៅធ្វើរូកូន»: tagged goal_hajj, the target in USD, dated by the chosen time", () => {
    const g = hajjGoalInput(5000, 36, new Date("2026-10-19T05:00:00Z"))
    assert.deepEqual(g, { name: HAJJ_GOAL_NAME, icon: HAJJ_GOAL_ICON, color: null, visibility: "SHARED", currency: "USD", balance: 0, goal_target: 5000, goal_date: "2029-10-19" })
    assert.equal(HAJJ_GOAL_NAME, "សន្សំទៅធ្វើរូកូន")
    // A Hajj goal kind for the goal form too — offered in Islamic Mode only, like Qurban.
    assert.ok(GOAL_PRESETS.some((p) => p.key === "goal_hajj"))
    assert.match(readFileSync(join(process.cwd(), "src/components/goals/goal-form-sheet.tsx"), "utf8"), /\(p\.key !== "goal_qurban" && p\.key !== "goal_hajj"\) \|\| islamic/)
    // Created in the member's own Personal space.
    assert.match(readFileSync(join(process.cwd(), "src/components/islamic/hajj-plan-card.tsx"), "utf8"), /w\.user_id === me && w\.type === "PERSONAL"/)
  })

  it("an existing goal shows its real progress; an archived one or an ordinary wallet does not count", () => {
    const wallets = [
      { id: "a", icon: "cash", goal_target: null, archived_at: null, balance: 900, currency: "USD" as const },
      { id: "b", icon: HAJJ_GOAL_ICON, goal_target: 5000, archived_at: "2026-01-01", balance: 100, currency: "USD" as const },
      { id: "c", icon: HAJJ_GOAL_ICON, goal_target: 5000, archived_at: null, balance: 2150, currency: "USD" as const },
    ]
    assert.equal(findHajjGoal(wallets)?.id, "c")
    assert.equal(findHajjGoal(wallets.slice(0, 2)), null)
    assert.deepEqual(hajjProgress(wallets[2]), { saved: 2150, target: 5000, percent: 43 })
    assert.equal(progressBlocks(43), "[█████░░░░░░░]")
    assert.equal(progressBlocks(100), "[████████████]")
    assert.equal(hajjProgress({ balance: 9000, goal_target: 5000 }).percent, 100)
  })

  it("only on the /islamic hub (Islamic Mode), below the SAR card", () => {
    const users = sources().filter((f) => /HajjPlanCard/.test(f.src) && !f.path.endsWith("hajj-plan-card.tsx"))
    assert.deepEqual(
      users.map((f) => relative(process.cwd(), f.path).split(sep).join("/")),
      ["src/app/(app)/islamic/page.tsx"],
    )
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/page.tsx"), "utf8")
    assert.ok(page.indexOf("<SarCard />") < page.indexOf("<HajjPlanCard />"))
    assert.match(page, /if \(settingsLoading \|\| !settings\.enabled\) return null/)
  })
})
