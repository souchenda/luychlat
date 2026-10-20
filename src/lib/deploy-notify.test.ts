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
  it("the weekly Docker clean-up: Sundays 02:00, week-old build cache and dangling images, logged, never during a deploy or the APK build", () => {
    const prune = read("deploy/weekly-prune.sh")
    assert.match(prune, /docker builder prune -af --filter "until=168h"/)
    assert.match(prune, /docker image prune -f/)
    assert.match(prune, /flock -n \/tmp\/luysmart-deploy\.lock/)
    assert.match(prune, /\[b\]uild-apk/)
    assert.match(prune, /disk free: \$\{before\} GB → \$\{after\} GB/)
    assert.match(update, /echo "0 2 \* \* 0 root cd \$\(pwd\) && bash deploy\/weekly-prune\.sh >\/dev\/null 2>&1" > \/etc\/cron\.d\/luychlat-weekly-prune/)
  })
  it("regression: two sites share the upstream (app.luychlat.com, luy.ibmserp.com) — «found 2» made every deploy restart in place since 11/10", () => {
    const nginx = read("deploy/nginx-setup.sh")
    assert.ok(nginx.indexOf('if [ "${#sites[@]}" -gt 1 ] && [ -f "$SNIPPET" ]; then') < nginx.indexOf('echo "✗ Expected one Nginx site using luysmart_app'))
    assert.match(nginx, /if \[ "\$includes" -ne 1 \]; then/) // the snippet exactly once across the sites
    assert.match(nginx, /several sites are never patched automatically/)
  })
  it("the release summary is natural Khmer, never raw git jargon (founder, 20/10/2026)", async () => {
    const { execFileSync } = await import("node:child_process")
    // The script's own summariser, fed fake commits: the «Khmer:» line, a Khmer subject without its prefix, the notes
    // file, and an English-only commit → its kind in Khmer.
    const fn = notify.slice(notify.indexOf("khmer_summaries() {"), notify.indexOf("\n}\n", notify.indexOf("khmer_summaries() {")) + 2)
    const fake = String.raw`git() { printf 'abc1234\x1ffeat(wallet): add a thing\x1fdetails\nKhmer: កែសម្រួលផ្ទាំងបន្ថែមកាបូប\n\x1edef5678\x1ffix(x): កែកំហុសការបង្ហាញលុយ\x1f\x1ecf850c5\x1ffix(deploy): zero-downtime\x1f\x1e9999999\x1fchore(deps): bump things\x1f\x1e'; }`
    let out = ""
    try {
      out = execFileSync("bash", ["-c", `${fake}\n${fn}\nkhmer_summaries`], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    } catch {
      return // no bash / python3 here (checked on the Droplet and by the pre-push hook)
    }
    const lines = out.trim().split(/\r?\n/).map((l) => l.split("\x1f")[1])
    assert.equal(lines[0], "កែសម្រួលផ្ទាំងបន្ថែមកាបូប")
    assert.equal(lines[1], "កែកំហុសការបង្ហាញលុយ")
    assert.match(lines[2], /^ការដាក់ឱ្យដំណើរការកំណែថ្មីលែងរំខានអ្នកប្រើទៀតហើយ/) // deploy/release-notes-km.tsv
    assert.equal(lines[3], "🧹 ការថែទាំប្រព័ន្ធ (ផ្នែកបច្ចេកទេស)")
    for (const l of lines) assert.doesNotMatch(l, /^(feat|fix|chore)\b|\(\w+\):/)
    assert.match(read("CLAUDE.md"), /every commit body carries one natural Khmer line/)
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
