import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

// deploy/ is not in the Docker build context (.dockerignore): checked locally and by the pre-push hook.
const here = existsSync(join(process.cwd(), "deploy/deploy-window.sh"))
const shell = here && spawnSync("sh", ["-c", "exit 0"]).status === 0

describe("A release that changes the database waits for the quiet hours (founder, 28/10/2026)", { skip: !here && "deploy/ is not in the build context" }, () => {
  const window = (hour: number, migrations: number, forced = 0) => spawnSync("sh", ["deploy/deploy-window.sh", String(hour), String(migrations), String(forced)]).status

  it("no migration: live at once, any hour (blue / green, no gap)", { skip: !shell && "no sh" }, () => {
    for (const h of [0, 9, 12, 18, 21, 23]) assert.equal(window(h, 0), 0, `${h}:00`)
  })
  it("a migration: only 22:00–06:59 Cambodia time — never while shops are open", { skip: !shell && "no sh" }, () => {
    for (const h of [22, 23, 0, 3, 6]) assert.equal(window(h, 1), 0, `${h}:00`)
    for (const h of [7, 9, 12, 18, 21]) assert.equal(window(h, 2), 1, `${h}:00`)
  })
  it("an urgent fix overrides the wait with «Deploy-now: …» in a commit", { skip: !shell && "no sh" }, () => {
    assert.equal(window(10, 1, 1), 0)
  })
  it("auto-update.sh asks the window before pulling, counts the new migrations (unknown history = one), tells the founder once", () => {
    const auto = read("deploy/auto-update.sh")
    assert.ok(auto.indexOf("deploy-window.sh") < auto.indexOf("exec ./deploy/update.sh"))
    assert.match(auto, /git diff --name-only "\$deployed" "\$target" -- supabase\/migrations\//)
    assert.match(auto, /else\n    migrations=1\n/)
    assert.match(auto, /grep -qE '\^Deploy-now:' && forced=1/)
    assert.match(auto, /hour=\$\(TZ=Asia\/Phnom_Penh date \+%-H\)/)
    assert.match(auto, /bash \.\/deploy\/deploy-notify\.sh held \|\| true\n/)
    const notify = read("deploy/deploy-notify.sh")
    assert.match(notify, /\[ "\$\(cat deploy\/run\/\.held-notified 2>\/dev\/null\)" = "\$head" \] && exit 0/)
    assert.ok(notify.includes('text="🌙 <b>កិច្ចការទី #$task រង់ចាំម៉ោង 22:00</b>'))
  })
})
