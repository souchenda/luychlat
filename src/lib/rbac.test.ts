import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { canPublishGlobally } from "./adhan-presets"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sql = read("supabase/migrations/20270195000000_content_admin_role.sql")

/**
 * Role-based access (founder, 19/10/2026): revenue, payments, subscriptions, members and settings are the founder's
 * alone; a content admin manages community content only. The database is the gate (the screens only follow it).
 */
describe("RBAC — the content admin never reaches money or settings", () => {
  it("«content_admin» is a role, but neither «admin» nor «staff»: every admin_* function refuses it", () => {
    assert.match(sql, /check \(role in \('support', 'admin', 'super_admin', 'content_admin'\)\)/)
    assert.match(sql, /function public\.is_staff\(\)[\s\S]*?a\.role in \('support', 'admin', 'super_admin'\)/)
    // is_admin() stays «admin» or «super_admin» — no migration ever adds the content admin to it.
    assert.doesNotMatch(sql, /function public\.is_admin\(\)/)
    // The financial functions: the founder only (also for the «admin» role) — a 42501 «super admin only» for anyone else.
    for (const f of ["admin_cancel_subscription", "admin_extend_subscription", "admin_list_payments", "admin_list_subscribers", "admin_list_users", "admin_review_payment", "admin_set_subscription_end"]) {
      assert.ok(sql.includes(`'${f}'`), f)
    }
    assert.match(sql, /execute replace\(def, 'perform public\.require_admin\(\)', 'perform public\.require_super_admin\(\)'\);/)
  })

  it("content: places, their photos, qasidah, du'a recordings and Adhans — the content admin, the admin, the founder", () => {
    assert.match(sql, /function public\.is_content_manager\(\)[\s\S]*?a\.role in \('content_admin', 'admin', 'super_admin'\)/)
    assert.match(sql, /tablename in \('islamic_places', 'nasheed_tracks'\)/)
    for (const f of ["dua_recording_put", "dua_recording_set", "dua_recording_remove", "adhan_preset_add", "adhan_preset_remove"]) assert.ok(sql.includes(`public.${f}(`), f)
    for (const r of ["src/app/api/duas/audio/route.ts", "src/app/api/adhan/presets/route.ts"]) assert.match(read(r), /rpc\("is_content_manager"\)/, r)
    assert.equal(canPublishGlobally("content_admin"), true)
  })

  it("/admin for a content admin: the content hub only — no payments, members, staff or settings", () => {
    const page = read("src/app/(app)/admin/page.tsx")
    assert.match(page, /if \(role === "content_admin"\) return <ContentAdminHub \/>/)
    assert.match(page, /\{founder && <PendingPayments \/>\}/)
    assert.match(page, /\{founder && <Subscribers \/>\}/)
    const hub = read("src/components/admin/content-admin-hub.tsx").replace(/\/\*\*[\s\S]*?\*\//g, "") // the code, not its comment
    assert.doesNotMatch(hub, /rpc\(|admin_|payment|revenue|subscri/i)
  })

  it("Yerny is a content admin; a content admin is never locked behind account-wide 2FA (no console to protect)", () => {
    assert.match(sql, /update public\.app_admins set role = 'content_admin' where user_id = member/)
    assert.ok(sql.includes(String.raw`$x$if p_role <> 'content_admin' then \1 end if;$x$`))
    // The founder edits a member's contact email from their card — never the sign-in; audited.
    assert.match(sql, /perform public\.audit\('CONTACT_EMAIL_SET'/)
  })
})
