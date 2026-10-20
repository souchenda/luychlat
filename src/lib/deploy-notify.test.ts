import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

// deploy/ is not in the Docker build context (.dockerignore): checked locally and by the pre-push hook.
const here = existsSync(join(process.cwd(), "deploy/deploy-notify.sh"))

describe("Every production release reaches the founder's private chat (founder, 20/10/2026)", { skip: !here && "deploy/ is not in the build context" }, () => {
  const notify = here ? read("deploy/deploy-notify.sh") : ""
  const update = here ? read("deploy/update.sh").replace(/\r\n/g, "\n") : ""
  it("live: after the health check and the switch, the «Production (Live)» card with the commit, the disk and the time", () => {
    assert.match(update, /echo "✓ Deployed \$\(git rev-parse --short HEAD\) on \$next"\nbash \.\/deploy\/deploy-notify\.sh ok "\$prev_deployed"/)
    assert.ok(update.indexOf('step="health check"') < update.indexOf("deploy-notify.sh ok"))
    for (const line of ["🚀 <b>ប្រព័ន្ធបានដាក់ឱ្យដំណើរការលើ Production (Live)</b>", "• <b>កូដកំណែថ្មី (Commit)៖</b> <code>$head</code>", "• <b>ខ្លឹមសារកែប្រែ៖</b>", "• <b>ស្ថានភាព Server៖</b> $status (${free:-?} ទំនេរ", "• <b>វេលាម៉ោង៖</b> $when", "• <b>តំណភ្ជាប់៖</b> https://app.luychlat.com", "— ប្រព័ន្ធស្វ័យប្រវត្តិ អេប លុយឆ្លាត"])
      assert.ok(notify.includes(line), line)
    assert.match(notify, /TZ=Asia\/Phnom_Penh date/)
  })
  it("failed: one «Deploy Failed» card per commit with the step that failed — the 5-minute retries never repeat it", () => {
    assert.match(update, /trap notify_failure EXIT/)
    assert.match(update, /\[ "\$code" = "0" \] \|\| bash \.\/deploy\/deploy-notify\.sh fail "\$step" "\$code"/)
    assert.match(update, /git rev-parse HEAD > deploy\/\.deployed\n# Live and healthy[^\n]*\ntrap - EXIT/)
    assert.match(notify, /⚠️ <b>ការដាក់ឱ្យដំណើរការមិនជោគជ័យ \(Deploy Failed\)<\/b>/)
    assert.match(notify, /\[ "\$\(cat deploy\/run\/\.failed-notified 2>\/dev\/null\)" = "\$head" \] && exit 0/)
  })
  it("the founder's private chat only — never «LCA Approval» or any group; the count is logged; never fails the deploy", () => {
    assert.match(notify, /chats=\$\(env_value FOUNDER_TELEGRAM_CHAT_ID\)/)
    assert.match(notify, /where l\.chat_id > 0/)
    assert.match(notify, /case "\$chat" in ''\|-\*\|\*\[!0-9\]\*\) continue ;; esac/) // a negative (group) id is skipped
    assert.doesNotMatch(notify, /APPROVAL|MARKETING_CHAT_ID|DEVOPS_CHAT_ID|5578121916"/)
    assert.match(notify, /sent to \$sent chat\(s\)/)
    assert.match(notify, /\nexit 0\n$/)
  })
})
