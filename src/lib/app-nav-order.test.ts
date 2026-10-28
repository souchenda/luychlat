import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "./i18n/dictionaries"
import { zh } from "./i18n/zh"

const nav = readFileSync(join(process.cwd(), "src/components/layout/app-nav.tsx"), "utf8").replace(/\r\n/g, "\n")

describe("The founder's Admin first in his menu (founder, 28/10/2026 — «I open it many times a day»)", () => {
  it("super admin: the staff group first, with the Control Center one tap away; other staff keep it last", () => {
    assert.match(nav, /const superAdmin = plan\.staff_role === "super_admin"/)
    assert.match(nav, /\.\.\.\(superAdmin \? \[\{ href: "\/admin\/super\/control", label: "nav\.controlCenter"/)
    assert.match(nav, /const arranged = superAdmin \? \[\.\.\.staff, \.\.\.allGroups\.filter\(\(g\) => g\.title !== "nav\.group\.staff"\)\] : allGroups/)
    assert.match(nav, /const groups = arranged\n/)
    // The staff group is still only for staff (the pages and their RPCs check the role in the database).
    assert.match(nav, /const staff = plan\.is_admin \|\| plan\.staff_role\n/)
  })
  it("named in three languages", () => {
    assert.equal(dictionaries.km["nav.controlCenter"], "មជ្ឈមណ្ឌលបញ្ជា")
    assert.equal(dictionaries.en["nav.controlCenter"], "Control Center")
    assert.equal(zh["nav.controlCenter"], "控制中心")
  })
})
