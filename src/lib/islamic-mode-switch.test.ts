import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { canManageIslamicMode } from "./islamic-access"

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

describe("Admin quick switch back to the general experience (founder, 19/10/2026)", () => {
  it("only an admin sees it: on the /islamic header, Islamic Mode off for themselves, then Home", () => {
    assert.equal(canManageIslamicMode({ is_admin: true }), true)
    assert.equal(canManageIslamicMode({ staff_role: "super_admin" }), true)
    assert.equal(canManageIslamicMode({ is_admin: false, staff_role: null }), false)
    const comp = read("src/components/islamic/islamic-mode.tsx")
    const fn = comp.slice(comp.indexOf("export function AdminGeneralModeSwitch"))
    assert.match(fn, /if \(!canManage \|\| !settings\.enabled\) return null/)
    assert.match(fn, /setEnabled\.mutate\(false,/)
    assert.match(fn, /router\.push\("\/home"\)/)
    assert.match(read("src/app/(app)/islamic/layout.tsx"), /<AdminGeneralModeSwitch \/>/)
    assert.equal(dictionaries.km["islamic.switchGeneral"], "🔄 មហាជន (General Mode)")
  })
  it("Settings keeps the Islamic Mode switch, enabled for admins", () => {
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /disabled=\{!canManage \|\| loading \|\| setEnabled\.isPending\}/)
  })
})
