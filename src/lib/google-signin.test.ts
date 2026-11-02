import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("sign in with Google (founder, 2/11/2026)", () => {
  it("the button shows only where Google allows it: switched on, and never inside the APK's WebView", () => {
    assert.match(read("src/components/auth/social-login.tsx"), /const google = authMethods\.has\("google"\) && !isNativeApp\(\)/)
  })
  it("Google comes back through /auth/callback, which exchanges the code on our own host", () => {
    assert.match(read("src/components/auth/social-login.tsx"), /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback\?next=\/home`/)
    assert.match(read("src/app/auth/callback/route.ts"), /exchangeCodeForSession\(code\)/)
  })
  it("it is switched on by the build argument alone (not a secret): NEXT_PUBLIC_AUTH_METHODS reaches the build", () => {
    assert.match(read("src/lib/supabase/config.ts"), /process\.env\.NEXT_PUBLIC_AUTH_METHODS/)
    // The Docker build's own test run has no Dockerfile in its context.
    if (existsSync(join(process.cwd(), "Dockerfile"))) assert.match(read("Dockerfile"), /ARG NEXT_PUBLIC_AUTH_METHODS/)
  })
})
