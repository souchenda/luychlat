import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, it } from "node:test"

import { convertSar, khrPerSar, SAR_PER_USD, usdPerSar } from "./sar"

/** Every source file under src/, except this feature's own. */
function sources(dir = join(process.cwd(), "src")): { path: string; src: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ path, src: readFileSync(path, "utf8") }] : []
  })
}

describe("The Saudi riyal for pilgrims — Islamic Community only (founder, 19/10/2026)", () => {
  it("1 USD = 3.75 SAR (the official peg); the riel rate is the NBC dollar rate ÷ 3.75", () => {
    assert.equal(SAR_PER_USD, 3.75)
    assert.equal(Math.round(khrPerSar(4070)), 1085) // ≈ 1,085 ៛ per SAR
    assert.equal(usdPerSar().toFixed(3), "0.267")
    assert.deepEqual(convertSar(100, "USD", 4070), { usd: 100, khr: 407_000, sar: 375 })
  })

  it("both ways, USD and SAR to the cent, computed riel to 100 ៛ (founder's rounding rule)", () => {
    assert.deepEqual(convertSar(375, "SAR", 4070), { usd: 100, khr: 407_000, sar: 375 })
    assert.deepEqual(convertSar(1000, "SAR", 4071), { usd: 266.67, khr: 1_085_600, sar: 1000 }) // 1,085,600 ៛ (1,085,600.0…)
    const fromKhr = convertSar(1_000_000, "KHR", 4070)!
    assert.equal(fromKhr.khr, 1_000_000) // the amount typed stays exact
    assert.equal(fromKhr.usd, 245.7)
    assert.equal(fromKhr.sar, 921.38)
    assert.equal(convertSar(100, "USD", 0), null) // no NBC rate yet: no guess
    assert.equal(convertSar(-5, "USD", 4070), null)
    assert.equal(convertSar(Number.NaN, "USD", 4070), null)
  })

  it("only on the /islamic hub (Islamic Mode) — never the general rates, the community channel or the dashboard", () => {
    const users = sources().filter((f) => /SarCard|lib\/islamic\/sar"/.test(f.src) && !f.path.includes(join("islamic", "sar")) && !f.path.endsWith("sar-card.tsx"))
    assert.deepEqual(
      users.map((f) => relative(process.cwd(), f.path).split(sep).join("/")),
      ["src/app/(app)/islamic/page.tsx"],
    )
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/page.tsx"), "utf8")
    assert.match(page, /if \(settingsLoading \|\| !settings\.enabled\) return null/) // the hub shows only in Islamic Mode
    for (const f of ["src/lib/server/community-bulletin.ts", "src/lib/server/market-sync.ts"]) assert.doesNotMatch(readFileSync(join(process.cwd(), f), "utf8"), /\bSAR\b/, f)
  })
})
