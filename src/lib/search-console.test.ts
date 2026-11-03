import assert from "node:assert/strict"
import { generateKeyPairSync, createVerify } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nightlyReportText } from "./nightly-report"
import { GSC_KEY_FILE, GSC_SCOPE, GSC_SITE, isSunday, parseServiceKey, searchConsoleLine, searchWeek, serviceAssertion } from "./search-console"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Google Search Console in the Sunday report (founder, 3/11/2026)", () => {
  it("last week's 7 complete days, ending 3 days back (Google lags); Sundays only", () => {
    assert.deepEqual(searchWeek("2026-11-08"), { start: "2026-10-30", end: "2026-11-05" })
    assert.equal(isSunday("2026-11-08"), true)
    for (const d of ["2026-11-02", "2026-11-07"]) assert.equal(isSunday(d), false, d)
  })

  it("one plain line: clicks, impressions, the top search — zero and a failure said, never silent", () => {
    assert.equal(searchConsoleLine("2026-11-08", { clicks: 12, impressions: 340, top: "កត់  លុយ" }), "Google 30/10–05/11: 12 clicks · 340 impressions · top search «កត់ លុយ»")
    assert.equal(searchConsoleLine("2026-11-08", { clicks: 1, impressions: 1, top: null }), "Google 30/10–05/11: 1 click · 1 impression")
    assert.equal(searchConsoleLine("2026-11-08", { clicks: 0, impressions: 0, top: null }), "Google 30/10–05/11: not in search results yet")
    assert.match(searchConsoleLine("2026-11-08", "error"), /could not be read/)
    // The Reporting Standard: no new emoji, and a top search is cut short.
    assert.ok(searchConsoleLine("2026-11-08", { clicks: 1, impressions: 2, top: "x".repeat(200) }).length < 120)
  })

  it("the line sits under the health line in the nightly card, only when given", () => {
    const base = { day: "2026-11-08", healthy: true, issues: [], diskFreeGb: 50, diskPct: 40, ramPct: 40, ramTotalGb: 2, newUsers: 1, approvals: 0, dockerOk: true, webhookOk: true }
    const line = searchConsoleLine("2026-11-08", { clicks: 3, impressions: 40, top: null })
    assert.ok(nightlyReportText({ ...base, google: line }).includes(line))
    assert.doesNotMatch(nightlyReportText(base), /Google/)
    const server = read("src/lib/server/nightly-report.ts")
    assert.match(server, /const gsc = isSunday\(day\) \? await searchConsoleWeek\(day\) : null/)
  })

  it("the service account signs its own token request (RS256), read-only scope, the Domain property", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const key = parseServiceKey(JSON.stringify({ type: "service_account", client_email: "report@app-luy-chlat.iam.gserviceaccount.com", private_key: pem }))!
    assert.ok(key)
    const jwt = serviceAssertion(key, 1_800_000_000)
    const [h, c, s] = jwt.split(".")
    assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url")))
    const claims = JSON.parse(Buffer.from(c, "base64url").toString())
    assert.equal(claims.scope, GSC_SCOPE)
    assert.match(GSC_SCOPE, /webmasters\.readonly$/) // read-only, never changes the property
    assert.equal(claims.exp - claims.iat, 3600)
    assert.equal(GSC_SITE, "sc-domain:luychlat.com")
    for (const bad of ["", "{}", "not json", JSON.stringify({ client_email: "a", private_key: "b" })]) assert.equal(parseServiceKey(bad), null, bad)
  })

  it("the key stays out of git and the code: a file on the server only, under the read-only mount", () => {
    assert.equal(GSC_KEY_FILE, "/run/luysmart/gsc-key.json")
    // Not in the Docker build's context: checked where they exist (locally and in the pre-push hook).
    if (existsSync("docker-compose.yml")) assert.match(read("docker-compose.yml"), /\.\/deploy\/run:\/run\/luysmart:ro/)
    if (existsSync(".gitignore")) assert.match(read(".gitignore"), /^deploy\/run\/gsc-key\.json\r?$/m)
  })
})
