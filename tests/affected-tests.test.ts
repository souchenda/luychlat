import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { affected } from "../scripts/affected-tests.mjs"

// Only the changed part is tested, wherever (founder, 5/11/2026 — mandatory).
describe("the tests a release runs: only those that cover what changed", () => {
  const tests = ["src/lib/helpline/site.test.ts", "src/lib/helpline/knowledge.test.ts", "tests/helpline-site.test.ts", "src/lib/money.test.ts", "tests/website-check.test.ts"]
  const body: Record<string, string> = {
    "src/lib/helpline/site.test.ts": 'import { siteReply } from "./site"',
    "src/lib/helpline/knowledge.test.ts": 'read("src/components/helpline/helpline-chat.tsx")',
    "tests/helpline-site.test.ts": 'read("src/app/api/helpline/site/route.ts"); read("supabase/migrations/20270294000000_helpline_site.sql")',
    "src/lib/money.test.ts": 'import { roundRiel } from "./money"',
    "tests/website-check.test.ts": 'read("deploy/auto-update.sh")',
  }
  const run = (changed: string[]) => affected(changed, tests, (t: string) => body[t] ?? "")

  it("the test beside a module, the tests that name it, a changed test itself — nothing else", () => {
    assert.deepEqual(run(["src/lib/helpline/site.ts"]), ["src/lib/helpline/site.test.ts"])
    assert.deepEqual(run(["src/components/helpline/helpline-chat.tsx"]), ["src/lib/helpline/knowledge.test.ts"])
    assert.deepEqual(run(["supabase/migrations/20270294000000_helpline_site.sql"]), ["tests/helpline-site.test.ts"])
    assert.deepEqual(run(["deploy/auto-update.sh"]), ["tests/website-check.test.ts"])
    assert.deepEqual(run(["src/lib/money.test.ts"]), ["src/lib/money.test.ts"])
    assert.deepEqual(run(["CLAUDE.md"]), [])
  })

  it("a new migration also runs the tests that scan the whole migrations folder (6/11/2026)", () => {
    const withScan = [...tests, "src/lib/migration-safety.test.ts"]
    const scan = (t: string) => (t === "src/lib/migration-safety.test.ts" ? 'const DIR = join(process.cwd(), "supabase/migrations")' : (body[t] ?? ""))
    assert.deepEqual(affected(["supabase/migrations/20270295000000_admin_roster_watch.sql"], withScan, scan), ["src/lib/migration-safety.test.ts"])
    // A file at the top of a folder like deploy/ never names «deploy» (it would match every test).
    assert.deepEqual(affected(["deploy/new-script.sh"], withScan, scan), [])
  })

  it("the whole suite only when the toolchain changed or nothing is known", () => {
    assert.equal(run([]), "ALL")
    assert.equal(run(["ALL"]), "ALL")
    for (const f of ["package.json", "package-lock.json", "tsconfig.json", "Dockerfile", "scripts/affected-tests.mjs"]) assert.equal(run([f]), "ALL", f)
  })
})
