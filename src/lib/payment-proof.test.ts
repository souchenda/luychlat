import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { GUIDE } from "./guide/content"
import { dictionaries } from "./i18n/dictionaries"
import { zh } from "./i18n/zh"
import { proofOf, referenceOk } from "./payment-proof"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("Regression: «I've paid» tapped without paying — the first customer took the app for a bank (founder, 28/10/2026)", () => {
  it("a request carries its transaction code: at least 4 letters or digits", () => {
    for (const ok of ["TRX1234", "0f3a9c7e", "#12345678", "ref 9 8 7 6"]) assert.equal(referenceOk(ok), true, ok)
    for (const no of ["", "   ", "abc", "#-_ .", null, undefined]) assert.equal(referenceOk(no), false, String(no))
    assert.equal(proofOf({ reference: null }), "missing")
    assert.equal(proofOf({ reference: "TRX1234" }), "ok")
  })
  it("the database refuses a transfer or KHQR request without it — and keeps PRO and ULTRA as live", () => {
    const sql = read("supabase/migrations/20270273000000_payment_reference_required.sql")
    assert.match(sql, /if p_method in \('BANK_TRANSFER', 'KHQR'\) and length\(regexp_replace\(coalesce\(p_reference, ''\), '\[\^0-9A-Za-z\]', '', 'g'\)\) < 4 then\n\s+raise exception 'reference_required'/)
    // The live definition had become PRO and ULTRA (20261103000000_growth_controls); never narrowed back to PRO.
    assert.match(sql, /tier in \('PRO', 'ULTRA'\) and active/)
    assert.doesNotMatch(sql, /tier = 'PRO' and active/)
  })
  it("the form cannot send without it; the approver sees a request without one and confirms having seen the money", () => {
    const sheet = read("src/components/billing/upgrade-sheet.tsx")
    assert.match(sheet, /disabled=\{request\.isPending \|\| !referenceOk\(reference\)\}/)
    assert.match(sheet, /\/reference_required\/\.test\(message\) \? t\("upgrade\.referenceRequired"\)/)
    const admin = read("src/app/(app)/admin/page.tsx")
    assert.match(admin, /const ask = proofOf\(p\) === "missing" \? "admin\.approveNoProofConfirm" : "admin\.approveConfirm"/)
    assert.match(admin, /\{proofOf\(p\) === "missing" && <p[^>]*>\{t\("admin\.noProof"\)\}<\/p>\}/)
  })
  it("said plainly where people start: a money notebook, not a bank — onboarding first, the wallet form, the Guide, the website", () => {
    assert.match(read("src/components/onboarding/welcome-guide.tsx"), /const STEPS = \[\n[^\n]*\n\s+\{ icon: BookOpenIcon, key: "notebook" \},/)
    assert.match(dictionaries.km["onboarding.notebook.title"], /សៀវភៅកត់ត្រាលុយ មិនមែនធនាគារទេ/)
    assert.ok(zh["onboarding.notebook.body"] && dictionaries.en["onboarding.notebook.body"])
    assert.match(read("src/components/wallets/wallet-form-sheet.tsx"), /t\("walletForm\.openingBalanceHint"\)/)
    assert.match(GUIDE[0].items[0].q.km, /ដកលុយ/)
    assert.match(read("Website/index.html"), /data-i="faq\.q6"/)
  })
})
