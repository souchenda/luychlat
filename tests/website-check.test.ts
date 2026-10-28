import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// Website/ is not in the Docker build context (.dockerignore): checked locally and before every push.
const here = existsSync(join(process.cwd(), "Website/index.html"))

describe("luychlat.com passes its quality gate (founder, 28/10/2026 — «the whole world sees it»)", { skip: !here && "Website/ is not in the build context" }, () => {
  it("no forbidden word, no untranslated text, no broken link or missing file on any page (scripts/website-check.mjs)", () => {
    const r = spawnSync(process.execPath, ["scripts/website-check.mjs"], { encoding: "utf8" })
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })
})
