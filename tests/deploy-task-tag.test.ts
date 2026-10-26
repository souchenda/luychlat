import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// deploy/ is not in the Docker build context (.dockerignore): checked where the sources are, like apk-version.test.ts.
const here = existsSync(join(process.cwd(), "deploy", "task-tag.sh"))
const shell = here && spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).stdout?.trim() === "ok"
const skip = !here ? "deploy/ is not in the build context" : !shell ? "no bash here" : false

/** The release's commit messages, as deploy-notify.sh pipes them (each ends with the record separator 0x1e). */
const tagOf = (...messages: string[]) =>
  spawnSync("bash", ["deploy/task-tag.sh"], { input: messages.map((m) => `${m}\n\x1e`).join(""), encoding: "utf8" }).stdout.trim()

describe("The deploy card's task number (founder, 26/10/2026 — Task #515: Task #514 showed as #512)", { skip }, () => {
  it("«Task #514.» (no colon) — the form every commit body uses — counts; «Task: #049» and «កិច្ចការទី #N» too", () => {
    assert.equal(tagOf("feat(ai): …\n\nTask #514. They called gemini-flash-latest directly…"), "514")
    assert.equal(tagOf("fix: x\n\nTask: #049"), "49")
    assert.equal(tagOf("fix: x\n\ntask #9 done"), "9")
    assert.equal(tagOf("ជួសជុល\n\nកិច្ចការទី #515"), "515")
    assert.equal(tagOf("ជួសជុល\n\nកិច្ចការ: #77"), "77")
  })
  it("a commit's own task is its FIRST mention — «Task #497's rule still holds» later in the body is a reference", () => {
    assert.equal(tagOf("fix(bot): …\n\nTask #507. On 26/10 …\n- Typed notes still add up (Task #497's rule)."), "507")
  })
  it("several tasks in one release (Tasks #509 and #510 deployed together) → the highest; untagged fixes don't count", () => {
    assert.equal(tagOf("feat(bot): …\n\nTask #510. The $370 slip…", "fix(test): skip the Android sources (deploy of 6098bab)", "feat(soundbox): …\n\nTask #509. Settings…"), "510")
  })
  it("no task named → nothing (the card counts on from the last release, as before); a bare «#12» or a hash is not a task", () => {
    assert.equal(tagOf("chore: bump\n\nKhmer: …"), "")
    assert.equal(tagOf("fix: issue #12 and commit 6098bab"), "")
  })
  it("deploy-notify.sh reads every commit since the last announced release, through task-tag.sh", () => {
    const s = readFileSync(join(process.cwd(), "deploy", "deploy-notify.sh"), "utf8").replace(/\r\n/g, "\n")
    assert.match(s, /range="-1 \$full"/)
    assert.match(s, /git merge-base --is-ancestor "\$prev" "\$full" 2>\/dev\/null; then range="-n 40 \$prev\.\.\$full"; fi/)
    assert.match(s, /tag=\$\(git log --format='%B%x1e' \$range 2>\/dev\/null \| sh deploy\/task-tag\.sh\)/)
  })
})
