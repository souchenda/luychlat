import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { initialAuthTab } from "./login-mode"

describe("The sign-in form's first tab (Task #529)", () => {
  it("?signup=1 opens «បង្កើតគណនី»", () => {
    assert.equal(initialAuthTab("?signup=1"), "signup")
    assert.equal(initialAuthTab("?lang=km&signup=1"), "signup")
  })
  it("everything else opens «ចូលគណនី», as before", () => {
    for (const s of ["", "?signup=0", "?signup=true", "?signed_out=elsewhere", "?deleted=1", "?error=oauth"]) assert.equal(initialAuthTab(s), "signin", s)
  })
  it("is wired into the form", () => {
    const form = readFileSync(join(process.cwd(), "src/components/auth/email-login.tsx"), "utf8")
    assert.match(form, /initialAuthTab\(window\.location\.search\) === "signup"/)
  })
})
