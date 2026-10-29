import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Staff in the app: the badge, the role from the user's card, the admin portal (founder, 19/10/2026)", () => {
  it("the admin directory shows «🛡️ … / Staff» and lets the super admin change the role there (the same audited functions)", () => {
    const badges = read("src/components/admin/account-controls.tsx")
    assert.match(badges, /<StaffBadge userId=\{user\.user_id\} \/>/)
    assert.match(badges, /<StaffRoleRow userId=\{user\.user_id\} email=\{user\.email\} name=\{label\} \/>/)
    const role = read("src/components/admin/staff-role.tsx")
    assert.match(role, /fn: "admin_staff_set", args: \{ p_email: email, p_role: next, p_note: note \}/)
    assert.match(role, /fn: "admin_staff_remove", args: \{ p_user_id: userId, p_note: note \}/)
    assert.match(role, /if \(!superAdmin \|\| !email\) return null/) // only the super admin sees the control
    assert.match(role, /const locked = member\?\.is_owner \|\| userId === me/) // never the owner, never oneself
  })

  it("a staff member's profile: «role · space» and the portal — content at once, the console behind 2FA", () => {
    const profile = read("src/app/(app)/profile/page.tsx")
    assert.match(profile, /plan\.staff_role \? `\$\{t\(`admin\.role\.\$\{plan\.staff_role\}`/)
    assert.match(profile, /<AdminPortalCard \/>/)
    const card = read("src/components/admin/admin-portal-card.tsx")
    assert.match(card, /if \(role !== "admin" && role !== "super_admin" && role !== "content_admin"\) return null/)
    for (const href of ['"/islamic/places"', '"/islamic/nasheed"', '"/islamic/duas"']) assert.ok(card.includes(href), href)
    assert.match(card, /href=\{consoleReady \? "\/admin" : "\/settings\/security"\}/)
  })

  it("Yerny's account is no longer locked behind 2FA; the console keeps asking for it (audited)", () => {
    const sql = read("supabase/migrations/20270194000000_yerny_2fa_optional.sql")
    assert.match(sql, /update public\.account_controls set require_2fa = false, updated_at = now\(\) where user_id = member and require_2fa;/)
    assert.match(sql, /perform public\.audit\('STAFF_2FA_OPTIONAL'/)
  })
})
