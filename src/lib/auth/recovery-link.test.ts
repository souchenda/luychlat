import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { recoveryFromHash } from "./recovery-link"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("password reset by e-mail opens in any browser (29/10/2026 — the link opened in Chrome, no password box)", () => {
  it("reads the session the link brought, only for a recovery", () => {
    assert.deepEqual(recoveryFromHash("#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery"), {
      kind: "session",
      accessToken: "a.b.c",
      refreshToken: "r1",
    })
    assert.equal(recoveryFromHash("#access_token=a&refresh_token=r&type=magiclink"), null)
    assert.equal(recoveryFromHash(""), null)
  })
  it("a used or expired link says so", () => {
    assert.deepEqual(recoveryFromHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"), {
      kind: "error",
      code: "otp_expired",
    })
  })
  it("the reset is asked with the implicit flow, straight to /reset-password, and the page wipes the tokens from the URL", () => {
    const login = read("src/components/auth/email-login.tsx")
    assert.match(login, /getImplicitClient\(\)[\s\S]{0,80}resetPasswordForEmail/)
    assert.match(read("src/lib/supabase/implicit-client.ts"), /flowType:\s*"implicit"/)
    const page = read("src/app/reset-password/page.tsx")
    assert.match(page, /recoveryFromHash\(/)
    assert.match(page, /history\.replaceState/)
  })
})
