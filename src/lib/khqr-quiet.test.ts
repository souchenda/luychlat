import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { khqrQuiet } from "./khqr-quiet"

const route = readFileSync("src/app/api/khqr/ingest/route.ts", "utf8")
const sql = readFileSync("supabase/migrations/20270301000000_khqr_ppcbank_quiet.sql", "utf8")

describe("KHQR «record only» and PPCBank (founder, 8/11/2026)", () => {
  it("only a strict true silences", () => {
    assert.deepEqual([khqrQuiet({ quiet: true }), khqrQuiet({ quiet: false }), khqrQuiet({}), khqrQuiet(null), khqrQuiet({ quiet: "true" })], [true, false, false, false, false])
  })

  it("a quiet business gets no private message, no debt question, no SoundBox, voice or push", () => {
    assert.match(route, /if \(quiet\) logEvent\([\s\S]*?else if \(message && r\.workspace_id\) await notifyOwner/)
    assert.match(route, /if \(!quiet && r\.status === "ok" && r\.transaction_id\) void offerDebtMatch/)
    assert.match(route, /if \(!quiet && shouldEmit\(r\.status\) && r\.transaction_id\) \{/)
  })

  it("a held payment is still asked, even for a quiet business (never booked by a guess)", () => {
    const held = route.indexOf('if (r.status === "ask")')
    assert.ok(held > 0)
    assert.doesNotMatch(route.slice(held, route.indexOf("const http")), /quiet/)
  })

  it("the database accepts PPCBank and finds its wallet by the bank, never another bank's", () => {
    assert.match(sql, /if v_bank not in \('ACLEDA', 'ABA', 'PPCBANK'\)/)
    assert.ok(sql.includes(String.raw`when v_bank = 'PPCBANK' then '(ppc\s*bank|(^|[^a-z])ppcb([^a-z]|$)|`))
    // AUTOBOK labels it «PPCBank»; the receiving-bank swap is ABA ↔ ACLEDA only, so a 9-digit PPCBank Ref No keeps it.
    assert.match(sql, /v_bank := public\.khqr_receiving_bank\(v_bank, v_ref\)/)
    assert.match(sql, /'quiet', coalesce\(\(select w\.khqr_quiet/)
    assert.match(sql, /function public\.khqr_set_quiet[\s\S]*?w\.type = 'BUSINESS' and w\.user_id = \(select auth\.uid\(\)\)/)
  })

  it("the wallet pattern matches PPCBank names and not ABA / ACLEDA ones", () => {
    const re = /(ppc\s*bank|(^|[^a-z])ppcb([^a-z]|$)|phnom penh commercial|ភីភីស៊ីប៊ី)/
    for (const name of ["ppcbank usd", "ppc bank", "ppcb 7387", "ហាង ppcb", "phnom penh commercial bank"]) assert.match(name, re, name)
    for (const name of ["aba usd", "acleda ៛", "cash", "ppcbx"]) assert.doesNotMatch(name, re, name)
  })
})
