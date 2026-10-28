import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  ERRORS_PER_SESSION,
  buildLabel,
  cleanErrorMessage,
  cleanPage,
  deviceInfo,
  deviceLine,
  ignoredError,
  isOutdated,
  parseSupportCode,
  shouldReportError,
  supportCode,
  supportText,
} from "./diagnostics"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const S24 = "Mozilla/5.0 (Linux; Android 14; SM-S921B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 LuyChlatApp/12"
const env = { ua: S24, width: 384, height: 832, dpr: 2.8125, rootFontPx: 18, dark: true, standalone: true, lang: "km", workspace: "BUSINESS" as const, islamic: true }

describe("Seeing what the person sees — «I read 6, they read 9» (founder, 28/10/2026)", () => {
  it("the support code: the first 6 characters of the account id, read back from any spelling", () => {
    assert.equal(supportCode("7f3k2a00-0000-0000-0000-000000000000".replace("k", "c")), "LC-7F3C2A")
    assert.equal(supportCode(null), null)
    for (const s of ["LC-7F3C2A", "lc7f3c2a", " 7f3c2a "]) assert.equal(parseSupportCode(s), "7f3c2a", s)
    assert.equal(parseSupportCode("LC-7F3"), null)
    assert.equal(parseSupportCode("dara"), null)
  })
  it("the phone and its settings in one line — the model, the screen, a bigger font, dark, the app, the workspace", () => {
    const d = deviceInfo(env)
    assert.deepEqual([d.os, d.browser, d.kind, d.screen, d.dpr, d.font], ["SM-S921B", "Chrome", "phone", "384×832", 2.81, 18])
    assert.equal(deviceLine(d), "SM-S921B · Chrome · 384×832 @2.81x · font 18 · dark · app · km · BUSINESS · Islamic")
    assert.equal(deviceLine({ ...d, font: 16, dark: false, app: false, islamic: false }), "SM-S921B · Chrome · 384×832 @2.81x · browser · km · BUSINESS")
  })
  it("never money or a name in what is copied: the code, the version, the phone", () => {
    const text = supportText({ code: "LC-7F3C2A", build: "1761620400000", apk: "1.11 (12)", device: deviceInfo(env) })
    assert.equal(text.split("\n").length, 3)
    assert.match(text, /^LC-7F3C2A\nBuild 28\/10 10:00 · APK 1\.11 \(12\)\n/)
    assert.doesNotMatch(text, /\$|៛|balance|[\w.]+@[\w-]+\./) // «@2.81x» is the screen density, not an address
  })
  it("the version: the build time in Cambodia, and whether a phone runs an older one than the live", () => {
    assert.equal(buildLabel("1761620400000"), "28/10 10:00")
    assert.equal(buildLabel(null), "?")
    assert.equal(isOutdated("1761620400000", "1761624000000"), true)
    assert.equal(isOutdated("1761624000000", "1761624000000"), false)
    assert.equal(isOutdated(null, "1761624000000"), false) // unknown is never called old
  })
  it("errors: noise left out; amounts, phones and e-mails masked; ids collapsed in the page", () => {
    for (const m of ["ResizeObserver loop completed with undelivered notifications.", "Script error.", "TypeError: Failed to fetch", "TypeError: Load failed", ""]) assert.equal(ignoredError(m), true, m)
    assert.equal(ignoredError("TypeError: Cannot read properties of undefined (reading 'amount')"), false)
    assert.equal(cleanErrorMessage("Bad amount 1,250,000 for 012 345 678 from dara@gmail.com"), "Bad amount # for # from <email>")
    assert.equal(cleanErrorMessage("x".repeat(500)).length, 300)
    assert.equal(cleanPage("/wallets/0b8c1e2a-1111-4222-8333-444455556666/edit?tab=1"), "/wallets/:id/edit")
  })
  it("each message once per page, at most 10 — a loop never floods the table", () => {
    const sent = new Set<string>()
    assert.equal(shouldReportError("TypeError: x", sent), true)
    sent.add(cleanErrorMessage("TypeError: x"))
    assert.equal(shouldReportError("TypeError: x", sent), false)
    for (let i = 0; i < ERRORS_PER_SESSION; i++) sent.add(`e${i}`)
    assert.equal(shouldReportError("TypeError: y", sent), false)
  })
  it("wired: errors on every page, the report in the app, the ticket carries the phone, the code card, the admin views", () => {
    assert.match(read("src/components/providers.tsx"), /<ClientErrorReporter \/>/)
    assert.match(read("src/app/(app)/layout.tsx"), /<ClientReport \/>/)
    const support = read("src/app/(app)/support/page.tsx")
    assert.match(support, /device: readDevice\(\{ lang: locale, workspace: workspace\?\.type \?\? null, islamic \}\)/)
    assert.match(support, /<SupportCodeCard \/>/)
    assert.match(read("src/components/admin/customers.tsx"), /rpc<ClientReportRow\[\]>\("admin_client_reports"/)
    assert.match(read("src/app/(app)/admin/super/control/page.tsx"), /<ClientErrorsCard \/>/)
  })
  it("the database: own report only, errors read by super admins only, capped, kept 30 days, found by the support code", () => {
    const sql = read("supabase/migrations/20270270000000_client_diagnostics.sql")
    assert.match(sql, /create policy client_reports_own on public\.client_reports for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/)
    assert.doesNotMatch(sql, /create policy [^\n]*on public\.client_errors/) // no direct reads at all
    assert.match(sql, /function public\.admin_client_errors[\s\S]*?perform public\.require_super_admin\(\);/)
    assert.match(sql, /function public\.admin_client_reports[\s\S]*?perform public\.require_super_admin\(\);/)
    assert.match(sql, />= 30 then/)
    assert.match(sql, /delete from public\.client_errors where at < now\(\) - interval '30 days'/)
    assert.match(sql, /u\.id::text like lower\(substring\(p_search from/)
    assert.match(sql, /select public\.apply_security_gate\(\);\n$/)
  })
})
