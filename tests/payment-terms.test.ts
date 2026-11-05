import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

// The founder's terms (5/11/2026): payments are final (never refunded, withdrawn or exchanged); nothing is charged
// automatically — the customer chooses to pay again; when the period ends the account returns to FREE, data kept.
describe("payment terms — said before paying, and on the website", () => {
  it("the upgrade sheet says them before «I have paid», in three languages, with the link to the terms", () => {
    const sheet = read("src/components/billing/upgrade-sheet.tsx")
    assert.ok(sheet.indexOf('t("upgrade.terms")') > 0 && sheet.indexOf('t("upgrade.terms")') < sheet.indexOf('t("upgrade.iHavePaid")'))
    assert.match(sheet, /href="https:\/\/luychlat\.com\/privacy#payments"/)
    const km = read("src/lib/i18n/dictionaries.ts")
    assert.match(km, /"upgrade\.terms": "ការបង់ប្រាក់មិនសងវិញទេ។ អេបមិនកាត់លុយដោយស្វ័យប្រវត្តិទេ — ពេលអស់រយៈពេល គណនីត្រឡប់ទៅ FREE ហើយទិន្នន័យនៅដដែល។"/)
    assert.match(km, /"upgrade\.terms": "Payments are non-refundable\./)
    assert.match(read("src/lib/i18n/zh.ts"), /"upgrade\.terms": "付款概不退还。/)
  })

  // Website/ is not in the Docker build context.
  it("the website's privacy and terms page has them at #payments", { skip: !existsSync(join(process.cwd(), "Website/privacy.html")) && "Website/ not here" }, () => {
    const page = read("Website/privacy.html")
    assert.match(page, /<section id="payments">/)
    for (const k of ["d.s4b", "d.s4c", "d.s4d"]) assert.match(page, new RegExp(`data-i="${k}"`))
    assert.match(page, /មិនអាចសងវិញ ដកវិញ ឬប្តូរវិញបានទេ/)
    assert.match(page, /ត្រឡប់ទៅកញ្ចប់ FREE ដោយខ្លួនឯង/)
  })
})
