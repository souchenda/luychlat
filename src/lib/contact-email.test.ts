import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { contactEmailError, staffTarget } from "./auth-identifier"
import { parseApproverCommand } from "./co-approvers"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("A contact email for phone members; staff by email or phone (founder, 19/10/2026)", () => {
  it("«My profile» accepts a real email or nothing — never a phone sign-in address", () => {
    assert.equal(contactEmailError(""), false)
    assert.equal(contactEmailError(" Yerny@Gmail.com "), false)
    assert.equal(contactEmailError("yerny@"), true)
    assert.equal(contactEmailError("855962637581@phone.luy.ibmserp.com"), true)
    // Saved in profile_private (private), lower-cased — the sign-in is never touched.
    assert.match(read("src/lib/profile-private.ts"), /contact_email: v\.contact_email\?\.trim\(\)\.toLowerCase\(\) \|\| null/)
    assert.doesNotMatch(read("src/components/profile/profile-sheets.tsx"), /auth\.updateUser/)
    const sql = read("supabase/migrations/20270193000000_contact_email.sql")
    assert.match(sql, /lower\(contact_email\) not like '%@phone\.luy\.ibmserp\.com'/)
  })

  it("Admin › Staff: «096 263 7581», «0962637581» or «+855 96 263 7581» → the phone sign-in; an email as typed", () => {
    for (const v of ["096 263 7581", "0962637581", "+855 96 263 7581"]) assert.equal(staffTarget(v), "855962637581@phone.luy.ibmserp.com", v)
    assert.equal(staffTarget("Yerny@Gmail.com"), "yerny@gmail.com")
    assert.equal(staffTarget("hello"), null)
    // A member who added a contact email is found by it too.
    assert.match(read("supabase/migrations/20270193000000_contact_email.sql"), /select pp\.user_id into v_user from public\.profile_private pp where lower\(pp\.contact_email\) = lower\(btrim\(p_email\)\)/)
  })

  it("/addapprover passes «096 263 7581» to the database, which turns spaces and a leading 0 into the sign-in", () => {
    assert.deepEqual(parseApproverCommand("/addapprover 096 263 7581"), { action: "add", login: "096 263 7581" })
    const sql = read("supabase/migrations/20270188000000_co_approvers.sql")
    assert.match(sql, /digits := regexp_replace\(login, '\[\^0-9\]', '', 'g'\);/)
    assert.match(sql, /when digits like '0%' then '855' \|\| substr\(digits, 2\)/)
  })
})
