import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { INSTALL_SNOOZE_DAYS, installBannerMode, isIosUa } from "./install-banner"

const NOW = Date.parse("2026-11-03T10:00:00Z")
const base = { standalone: false, native: false, ios: false, canPrompt: true, snoozedAt: null, now: NOW }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("«ដំឡើងអេប លុយឆ្លាត» banner — one tap, not by hand (founder, 3/11/2026)", () => {
  it("the browser's own install where it can; the two Share steps on an iPhone; nothing elsewhere", () => {
    assert.equal(installBannerMode(base), "prompt")
    assert.equal(installBannerMode({ ...base, canPrompt: false, ios: true }), "ios")
    assert.equal(installBannerMode({ ...base, canPrompt: false }), null)
  })

  it("never inside the Android app or once on the home screen", () => {
    assert.equal(installBannerMode({ ...base, native: true }), null)
    assert.equal(installBannerMode({ ...base, standalone: true }), null)
    assert.equal(installBannerMode({ ...base, ios: true, canPrompt: false, standalone: true }), null)
  })

  it("× hides it for 14 days on this phone, then it comes back", () => {
    const day = 86_400_000
    assert.equal(installBannerMode({ ...base, snoozedAt: NOW - 3 * day }), null)
    assert.equal(installBannerMode({ ...base, snoozedAt: NOW - INSTALL_SNOOZE_DAYS * day }), "prompt")
  })

  it("an iPhone, an iPad (also one that says «Macintosh» with touch), never an Android", () => {
    assert.ok(isIosUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"))
    assert.ok(isIosUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", true))
    assert.ok(!isIosUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"))
    assert.ok(!isIosUa("Mozilla/5.0 (Linux; Android 14)"))
  })

  it("wired: in the app layout; the prompt caught once at load and shared with Settings; storage never throws", () => {
    assert.match(read("src/app/(app)/layout.tsx"), /<InstallBanner \/>/)
    const store = read("src/lib/install-prompt.ts")
    assert.match(store, /if \(typeof window !== "undefined"\) \{\r?\n\s+window\.addEventListener\("beforeinstallprompt"/)
    assert.match(read("src/components/settings/install-app.tsx"), /useInstallPrompt\(\)/)
    const banner = read("src/components/layout/install-banner.tsx")
    assert.match(banner, /isNativeApp\(\)/)
    assert.equal((banner.match(/try \{/g) ?? []).length, 2)
    // The brand, never «កម្មវិធី» / «អែប».
    assert.match(read("src/lib/i18n/dictionaries.ts"), /"install\.bannerTitle": "ដំឡើងអេប លុយឆ្លាត"/)
  })
})
