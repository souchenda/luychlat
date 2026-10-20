import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Toasts clear the iPhone Dynamic Island (founder, 20/10/2026)", () => {
  it("regression: the error toast sat under the status bar — the top offset adds the safe-area inset, on desktop and mobile", () => {
    const sonner = read("src/components/ui/sonner.tsx")
    assert.match(sonner, /export const TOAST_TOP_OFFSET = "max\(calc\(env\(safe-area-inset-top, 0px\) \+ 12px\), 16px\)"/)
    assert.match(sonner, /offset=\{\{ top: TOAST_TOP_OFFSET \}\}/)
    assert.match(sonner, /mobileOffset=\{\{ top: TOAST_TOP_OFFSET \}\}/)
    // The inset only exists with viewport-fit=cover; the one Toaster is top-centre with strong (rich) colours.
    assert.match(read("src/app/layout.tsx"), /viewportFit: "cover"/)
    assert.match(read("src/components/providers.tsx"), /<Toaster position="top-center" richColors \/>/)
  })
})
