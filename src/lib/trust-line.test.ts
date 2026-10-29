import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "./i18n/dictionaries"

// The founder's father left the community at the word «លុយ», afraid of phone scams (founder, 29/10/2026): the first
// thing a newcomer reads says we hold no money and never call or message for an OTP code or a password.
describe("the trust line a wary newcomer reads first", () => {
  it("the app's first welcome step, in Khmer and English", () => {
    assert.match(dictionaries.km["onboarding.notebook.body"], /មិនកាន់ មិនដក និងមិនផ្ទេរលុយ.*មិនដែលទូរសព្ទ ឬផ្ញើសារសុំលេខកូដ OTP ឬលេខសម្ងាត់/)
    assert.match(dictionaries.en["onboarding.notebook.body"], /never call or message you for an OTP code or a password/)
  })
  it("the website, right under the opening lines, in all three languages", () => {
    const page = join(process.cwd(), "Website/index.html")
    if (!existsSync(page)) return // not in the Docker build context
    const html = readFileSync(page, "utf8")
    assert.ok(html.indexOf('data-i="hero.safe"') > html.indexOf('data-i="hero.lead"'))
    assert.match(html, /មិនដែលទូរសព្ទ ឬផ្ញើសារសុំលេខកូដ OTP ឬលេខសម្ងាត់/)
    const t = readFileSync(join(process.cwd(), "Website/i18n.js"), "utf8")
    assert.equal(t.match(/"hero\.safe": /g)?.length, 2) // English and Chinese
  })
})
