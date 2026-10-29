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
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
    // In minutes, before the app's build (founder, 29/10/2026 — «why 45 minutes?»): auto-update syncs the website right
    // after its fetch; update.sh syncs again after a release (the safety net).
    const auto = read("deploy/auto-update.sh")
    assert.ok(auto.indexOf("bash deploy/website-sync.sh") > auto.indexOf("git fetch --quiet origin master"))
    assert.ok(auto.indexOf("bash deploy/website-sync.sh") < auto.indexOf("exec ./deploy/update.sh"))
    const update = read("deploy/update.sh")
    assert.ok(update.indexOf("bash ./deploy/website-sync.sh HEAD") > update.indexOf("git rev-parse HEAD > deploy/.deployed"), "only after the app is live")
    const sync = read("deploy/website-sync.sh")
    assert.match(sync, /git diff --quiet "\$last" "\$target" -- \$paths/) // only when the website changed
    assert.match(sync, /git archive "\$target" Website deploy\/landing-publish\.sh/) // the target's own copy, the checkout untouched
    assert.match(sync, /LANDING_REPO="\$\(pwd\)" WEBSITE_SRC="\$tmp\/Website" sh "\$tmp\/deploy\/landing-publish\.sh"/)
    assert.match(sync, /git rev-parse "\$target" > "\$stamp_file"/) // published once per change
    assert.match(read("deploy/landing-publish.sh"), /SRC=\$\{WEBSITE_SRC:-"\$REPO\/Website"\}/)
    assert.match(readFileSync(join(process.cwd(), ".githooks/pre-push"), "utf8"), /node scripts\/website-check\.mjs/)
  })
})
