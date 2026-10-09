/**
 * Financial integrity: a shared pool's spending slip posted twice is spent once.
 * (Regression 09/10: the same $17.88 slip photo to SOPHEAP KHEANG was booked at 09:19 and
 * again at 09:20.) Runs in the Docker build — a failure stops the deploy.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { cleanSlip, slipRef } from "@/lib/bot/bank-slip"
import { duplicateSlipText } from "@/lib/server/pool-flow"

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations")
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/\r\n/g, "\n"))

function latest(name: string): string {
  let body: string | null = null
  for (const m of sql) for (const match of m.matchAll(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "gi"))) body = match[1]
  assert.ok(body, `no definition of public.${name}`)
  return body
}

describe("pool spending: the same slip is never spent twice", () => {
  const body = latest("bot_pool_spend")
  it("checks the Trx ID, the photo's unique ID and the same file before spending", () => {
    const check = body.indexOf("'duplicate'")
    assert.ok(check > 0, "no duplicate answer")
    assert.ok(check < body.indexOf("insert into public.transactions"), "the check must come before the expense is booked")
    assert.match(body, /t\.bank_ref = 'ref:' \|\| v_ref/)
    assert.match(body, /t\.bank_ref = 'tg:' \|\| v_unique/)
    assert.match(body, /t\.receipt_url = uid::text \|\| '\/tg\/' \|\| p_photo/)
  })
  it("each spend keeps its mark, so a later repeat is caught", () => {
    assert.match(body, /coalesce\('ref:' \|\| v_ref, 'tg:' \|\| v_unique\)/)
  })
  it("the slip's Trx ID is read and normalised", () => {
    assert.equal(slipRef("Trx. ID: 0002 3472 6282 C4VF"), "000234726282C4VF")
    assert.equal(slipRef("12"), null)
    assert.equal(cleanSlip({ is_slip: true, amount: "-17.88", currency: "USD", direction: "OUT", party: "SOPHEAP KHEANG", ref: "000234726282c4vf" })?.ref, "000234726282C4VF")
  })
  it("the group is told, with what is left — nothing deducted", () => {
    assert.equal(
      duplicateSlipText({ amount: 17.88, currency: "USD", balance: 234.34, balance_currency: "USD" }, "SOPHEAP KHEANG"),
      "⚠️ ស្លីបនេះបានកត់ត្រារួចហើយ! (មិនកាត់ប្រាក់ស្ទួនឡើយ)\n🧾 ចំណាយ៖ SOPHEAP KHEANG ($17.88)\n💰 នៅសល់ក្នុងបេឡា៖ $234.34",
    )
  })
})
