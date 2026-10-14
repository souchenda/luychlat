// GOLDEN GUARD — the SoundBox is isolated (founder, 14/10/2026): its audio / background-playback code
// never touches sign-in, publishing or wallet balances, and nothing outside the SoundBox reaches into
// its audio module. A change that crosses the line fails the build.
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"

const ROOT = join(process.cwd(), "src")
const SOUNDBOX = ["lib/soundbox.ts", "lib/soundbox-audio.ts", "app/(app)/soundbox/page.tsx", "components/soundbox/soundbox-status.tsx", "lib/server/soundbox-watch.ts"]

const importsOf = (file: string) => [...readFileSync(join(ROOT, file), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])

/** What SoundBox code may never import: sign-in, publishing, wallet / balance writers, other state. */
const FORBIDDEN = [/auth/i, /passkey/, /session-guard/, /facebook-publisher/, /scheduled-posts/, /community-routine/, /prefs-store/, /lock-store/, /wallets?\//, /supabase-repo/, /debts/, /transactions/]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [relative(ROOT, p).replace(/\\/g, "/")] : []
  })
}

describe("GOLDEN 6 · SoundBox isolation", () => {
  it("the pure core (lib/soundbox.ts) imports nothing of the app at all", () => {
    assert.deepEqual(importsOf("lib/soundbox.ts").filter((m) => m.startsWith("@/") || m.startsWith(".")), [])
  })
  it("the audio module imports only the SoundBox core", () => {
    assert.deepEqual(importsOf("lib/soundbox-audio.ts"), ["@/lib/soundbox"])
  })
  it("no SoundBox file imports sign-in, publishing or wallet-balance code", () => {
    for (const file of SOUNDBOX) for (const m of importsOf(file)) assert.ok(!FORBIDDEN.some((re) => re.test(m)), `${file} imports ${m}`)
  })
  it("only the SoundBox page uses the audio module (audio changes can't reach other screens)", () => {
    const users = walk(ROOT).filter((f) => !f.endsWith(".test.ts") && importsOf(f).includes("@/lib/soundbox-audio"))
    assert.deepEqual(users, ["app/(app)/soundbox/page.tsx"])
  })
})
