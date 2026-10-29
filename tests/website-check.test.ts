import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// Website/ is not in the Docker build context (.dockerignore): checked locally and before every push.
const here = existsSync(join(process.cwd(), "Website/index.html"))

describe("luychlat.com passes its quality gate (founder, 28/10/2026 — «the whole world sees it»)", { skip: !here && "Website/ is not in the build context" }, () => {
  it("no forbidden word, no untranslated text, no broken link or missing file on any page (scripts/website-check.mjs)", () => {
    const r = spawnSync(process.execPath, ["scripts/website-check.mjs"], { encoding: "utf8" })
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })
  // deploy/ and .githooks/ are not in the Docker build context (regression 29/10/2026: this read failed the build there).
  const deployHere = existsSync(join(process.cwd(), "deploy/update.sh")) && existsSync(join(process.cwd(), ".githooks/pre-push"))
  it("a release that changes the website publishes it on its own, gated before the push (founder, 29/10/2026)", { skip: !deployHere && "deploy/ is not in the build context" }, () => {
    const update = readFileSync(join(process.cwd(), "deploy/update.sh"), "utf8")
    assert.match(update, /git diff --quiet "\$prev_deployed" HEAD -- Website\/ deploy\/landing-publish\.sh deploy\/site-prices\.py/)
    assert.match(update, /sh \.\/deploy\/landing-publish\.sh \|\| echo "! Website not published/)
    assert.ok(update.indexOf("landing-publish.sh ||") > update.indexOf('git rev-parse HEAD > deploy/.deployed'), "only after the app is live")
    assert.match(readFileSync(join(process.cwd(), ".githooks/pre-push"), "utf8"), /node scripts\/website-check\.mjs/)
  })
})
