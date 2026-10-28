import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
// deploy/ and Website/ are not in the Docker build context (.dockerignore): checked locally and before every push.
const here = existsSync(join(process.cwd(), "deploy/site-prices.py")) && existsSync(join(process.cwd(), "Website/index.html"))
const py = here ? ["python3", "python"].find((c) => spawnSync(c, ["--version"]).status === 0) : undefined

describe("luychlat.com shows the app's own prices (founder, 28/10/2026)", { skip: !here && "deploy/ is not in the build context" }, () => {
  it("every price on the page is marked for the publisher: PRO and ULTRA, dollars and riel", () => {
    const page = read("Website/index.html")
    for (const tier of ["PRO", "ULTRA"]) {
      assert.match(page, new RegExp(`<b data-plan="${tier}" data-m="[$][0-9.,]+" data-y="[$][0-9.,]+">`))
      assert.match(page, new RegExp(`<p class="riel" data-plan-khr="${tier}" data-m="[0-9,]+ ៛" data-y="[0-9,]+ ៛">`))
    }
  })
  it("published with the app's prices; a tier the database does not give whole keeps the page's own — never guessed", { skip: !py && "no python" }, () => {
    const dir = mkdtempSync(join(tmpdir(), "prices-"))
    mkdirSync(join(dir, "en"))
    writeFileSync(join(dir, "index.html"), read("Website/index.html"))
    writeFileSync(join(dir, "en", "index.html"), read("Website/en/index.html"))
    const plans = join(dir, "plans.json")
    writeFileSync(plans, JSON.stringify([
      { code: "PRO_MONTHLY", price_usd: 3.49, price_khr: 14000 },
      { code: "PRO_YEARLY", price_usd: 29.99, price_khr: 120000 },
      { code: "ULTRA_MONTHLY", price_usd: 9.99, price_khr: 40000 }, // no yearly: ULTRA left as it is
    ]))
    const r = spawnSync(py!, [join(process.cwd(), "deploy/site-prices.py"), dir, "--plans-json", plans], { encoding: "utf8" })
    assert.equal(r.status, 0, r.stderr)
    for (const f of ["index.html", join("en", "index.html")]) {
      const out = readFileSync(join(dir, f), "utf8")
      assert.match(out, /<b data-plan="PRO" data-m="\$3\.49" data-y="\$29\.99">\$3\.49<\/b>/)
      assert.match(out, /data-plan-khr="PRO" data-m="14,000 ៛" data-y="120,000 ៛">14,000 ៛</)
      assert.match(out, /<b data-plan="ULTRA" data-m="\$6\.99" data-y="\$59\.99">\$6\.99<\/b>/)
    }
    assert.match(readFileSync(join(dir, "index.html"), "utf8"), /"name": "PRO \(monthly\)", "price": "3\.49"/)
  })
  it("wired: the publisher refreshes them before versioning; a new price in Admin republishes the site", () => {
    const publish = read("deploy/landing-publish.sh")
    assert.ok(publish.indexOf('deploy/site-prices.py" "$next"') > 0 && publish.indexOf('deploy/site-prices.py" "$next"') < publish.indexOf('version_assets "$next"'))
    assert.match(read("src/components/admin/super-modules.tsx"), /if \("price_usd" in changes \|\| "price_khr" in changes\)\n\s+void rpc\("ops_request", \{ p_action: "website_republish" \}\)/)
  })
})
