import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { GUIDE } from "./guide/content"
import { type MessageKey, dictionaries } from "./i18n/dictionaries"
import { zh } from "./i18n/zh"
import { isPublicPath } from "./query-client"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("A lost or broken phone (founder, 28/10/2026): one tap closes every door it still has", () => {
  const sql = read("supabase/migrations/20270271000000_lost_phone.sql")
  it("every other sign-in ends — this one stays — super admins included, signed in only", () => {
    assert.match(sql, /if uid is null then\n\s+raise exception 'not authenticated'/)
    assert.match(sql, /delete from auth\.sessions where user_id = uid and id::text <> coalesce\(auth\.jwt\(\) ->> 'session_id', ''\);/)
    assert.doesNotMatch(sql, /is_super_admin/) // no exemption here, unlike the one-device rule
    assert.match(sql, /revoke all on function public\.secure_lost_phone\(\) from public, anon;/)
  })
  it("the Telegram bot is unlinked (whoever holds the phone can no longer use it) and the action is audited", () => {
    assert.match(sql, /delete from public\.telegram_links where user_id = uid;/)
    assert.match(sql, /perform public\.audit\('LOST_PHONE', uid/)
  })
  it("in Settings › Security, and on /lost — readable without signing in, the steps in order", () => {
    assert.match(read("src/components/settings/security-settings.tsx"), /<ActiveDevices \/>\n[^\n]*\n\s+<LostPhoneRow \/>/)
    assert.equal(isPublicPath("/lost"), true)
    const view = read("src/app/lost/lost-view.tsx")
    assert.match(view, /"lost\.step1", "lost\.step2", "lost\.step3", "lost\.step4", "lost\.step5", "lost\.step6"/)
    assert.match(view, /signedIn \? \(\n\s+<LostPhoneButton \/>/)
  })
  it("written in km / en / zh with 0-9 digits; the Guide explains it, with the other safety answers", () => {
    for (const k of ["lost.title", "lost.step1", "lost.step2", "lost.button", "lost.confirm", "lost.done"] as MessageKey[])
      for (const text of [dictionaries.km[k], dictionaries.en[k], zh[k]]) {
        assert.ok(text, k)
        assert.doesNotMatch(text!, /[០-៩]|LuyChlat|លោក/, k)
      }
    const safety = GUIDE.find((s) => s.id === "safety")
    assert.ok(safety)
    assert.ok(safety!.items.some((i) => /app\.luychlat\.com\/lost/.test(i.a.map((x) => x.km).join(" "))))
    assert.ok(safety!.items.some((i) => /LC-/.test(i.a.map((x) => x.en).join(" ")))) // the support code
  })
})
