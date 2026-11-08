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

describe("KHQR: one key, the shop found by its receiving account (founder, 8/11/2026 — «ធ្វើអីសាមញ្ញៗ»)", () => {
  const route2 = readFileSync("src/app/api/khqr/ingest/route.ts", "utf8")
  const sql2 = readFileSync("supabase/migrations/20270302000000_khqr_route_by_account.sql", "utf8")

  it("the API passes the receiving account through", () => {
    assert.match(route2, /receiving_account: str\(body\.receiving_account, 40\) \|\| null/)
  })

  it("only the key owner's own open businesses, matched on the last 4 digits of a wallet's account number", () => {
    assert.match(sql2, /w\.user_id = k\.created_by and w\.type = 'BUSINESS' and w\.archived_at is null/)
    assert.ok(sql2.includes(String.raw`right(regexp_replace(coalesce(x.account_no, ''), '\D', '', 'g'), 4) = last4`))
  })

  it("one business matches → that business and that wallet; none or two → the key's business (held there, never guessed)", () => {
    assert.match(sql2, /if coalesce\(cardinality\(hits\), 0\) = 1 then\s+ws_id := hits\[1\];/)
    assert.match(sql2, /ws_id := k\.workspace_id;/)
    assert.match(sql2, /pay := p_pay \|\| jsonb_build_object\('wallet_id', wallet_id\)/)
    // «record only» is the routed business's own setting.
    assert.match(sql2, /'quiet', coalesce\(\(select w\.khqr_quiet from public\.workspaces w where w\.id = ws_id\), false\)/)
  })

  it("the «record only» switch shows for every business, with or without its own key", () => {
    const info = readFileSync("supabase/migrations/20270303000000_khqr_quiet_any_business.sql", "utf8")
    assert.match(info, /return jsonb_build_object\('quiet', ws\.khqr_quiet\)\s+\|\| coalesce\(/)
    const card = readFileSync("src/components/settings/biz-khqr-card.tsx", "utf8")
    assert.match(card, /\{info\.data && \(\s+\/\/ Every business[^\n]*\n\s+<label/)
    assert.match(card, /\) : info\.data\?\.hint \? \(/) // the key line only when a key exists
  })
})

describe("PPCBank payments can be stored (regression: khqr_payments_bank_check, founder's test 8/11/2026 17:15)", () => {
  it("every bank khqr_record accepts is allowed by khqr_payments", () => {
    const fix = readFileSync("supabase/migrations/20270304000000_khqr_payments_ppcbank.sql", "utf8")
    const accepted = sql.match(/if v_bank not in \(([^)]*)\)/)![1]
    const allowed = fix.match(/check \(bank in \(([^)]*)\)\)/)![1]
    for (const bank of accepted.split(",").map((b) => b.trim())) assert.ok(allowed.includes(bank), `khqr_payments must allow ${bank}`)
  })
})

describe("PPCBank day-first dates (regression: 08/11/2026 booked as 11 August, founder 8/11/2026)", () => {
  it("the data fix touches only PPCBank KHQR rows whose swapped day is the day they were recorded", () => {
    const fix = readFileSync("supabase/migrations/20270305000000_khqr_ppcbank_swapped_dates.sql", "utf8")
    assert.match(fix, /k\.transaction_id = t\.id and k\.bank = 'PPCBANK'/)
    assert.match(fix, /extract\(day from t\.transaction_date at time zone 'Asia\/Phnom_Penh'\) <= 12/)
    assert.match(fix, /= \(t\.created_at at time zone 'Asia\/Phnom_Penh'\)::date;/)
    assert.doesNotMatch(fix, /set (amount|wallet_id|currency)/)
  })
})
