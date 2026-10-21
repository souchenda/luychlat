import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import type { Slip } from "@/lib/bot/bank-slip"
import type { Category, Wallet } from "@/lib/data/types"
import { dictionaries } from "@/lib/i18n/dictionaries"

import { slipCategoryChoices, slipEntryInput, slipErrorKey, slipInstant, slipNote, slipWallet, suggestedChoice } from "./slip-intake"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const wallet = (id: string, name: string, currency: "USD" | "KHR", extra: Partial<Wallet> = {}) => ({ id, name, currency, icon: null, kind: "STANDARD", account_no: null, ...extra }) as Wallet
const cat = (id: string, type: "INCOME" | "EXPENSE", preset_key: string) => ({ id, name: preset_key, type, preset_key }) as Category
const slip = (s: Partial<Slip>): Slip => ({ amount: 25, currency: "USD", direction: "OUT", bank: "ABA", date: "2026-10-21", time: "12:30", party: null, account: null, ...s })

const wallets = [wallet("aba-usd", "ABA USD", "USD", { icon: "aba" }), wallet("aba-khr", "ABA KHR", "KHR", { icon: "aba" }), wallet("acl-usd", "ACLEDA USD", "USD", { icon: "acleda", account_no: "016824222" }), wallet("cash", "សាច់ប្រាក់", "KHR", { kind: "STANDARD", icon: "cash" })]
const categories = [cat("food", "EXPENSE", "food"), cat("tr", "EXPENSE", "transport"), cat("shop", "EXPENSE", "shopping"), cat("util", "EXPENSE", "utilities"), cat("oth", "EXPENSE", "other_expense"), cat("sales", "INCOME", "sales"), cat("oi", "INCOME", "other_income")]

describe("The in-app slip scanner (founder, 21/10/2026 — Task #437: never sent out to Telegram)", () => {
  it("the wallet only when the slip settles it — and never another bank's wallet by its number (golden path 1)", () => {
    assert.equal(slipWallet(slip({}), wallets).walletId, "aba-usd") // the one ABA wallet in dollars
    // An ABA slip from a number saved on the ACLEDA wallet: not booked there — the ABA wallets are offered.
    const conflict = slipWallet(slip({ account: "016824222" }), wallets)
    assert.equal(conflict.walletId, null)
    assert.ok(!conflict.choices.some((w) => w.id === "acl-usd"))
    // A riel slip from a bank with no wallet here: a question, nothing preselected.
    assert.equal(slipWallet(slip({ currency: "KHR", bank: "Canadia" }), wallets).walletId, null)
  })
  it("the bot's one-tap categories with the workspace's own; the obvious payee suggested, nothing else guessed", () => {
    assert.deepEqual(slipCategoryChoices("EXPENSE", categories).map((c) => c.categoryId), ["food", "food", "tr", "shop", "util", "oth"])
    assert.deepEqual(slipCategoryChoices("INCOME", categories).map((c) => c.categoryId), ["sales", "oi", "oi"])
    assert.equal(suggestedChoice(slip({ party: "TOTALENERGIES TK" })), "bot.slipCat.fuel")
    assert.equal(suggestedChoice(slip({ party: "Brown Coffee" })), "bot.slipCat.coffee")
    assert.equal(suggestedChoice(slip({ party: "SOK DARA" })), null)
    assert.equal(suggestedChoice(slip({ direction: "IN", party: "Brown Coffee" })), null)
  })
  it("the entry: the exact amount (51,500 ៛ stays 51,500 — a bank stated it), the slip's time, the photo, the rate only across currencies", () => {
    const riel = slip({ amount: 51_550, currency: "KHR", party: "TOTALENERGIES TK", time: "08:05" })
    const fuel = slipCategoryChoices("EXPENSE", categories)[2]
    const entry = slipEntryInput(riel, { wallet: { id: "aba-usd", currency: "USD" }, category: { ...fuel, preset: "transport" }, tagText: "⛽ ចាក់សាំង", rate: 4012, receipt: "r/1.jpg" })
    assert.equal(entry.amount, 51_550)
    assert.deepEqual([entry.currency, entry.exchange_rate, entry.receipt_url, entry.type], ["KHR", 4012, "r/1.jpg", "EXPENSE"])
    assert.equal(entry.transaction_date, "2026-10-21T01:05:00.000Z") // 08:05 in Phnom Penh
    assert.equal(entry.note, "⛽ ចាក់សាំង · 🧾 ABA → TOTALENERGIES TK")
    const usd = slipEntryInput(slip({}), { wallet: { id: "aba-usd", currency: "USD" }, category: { ...slipCategoryChoices("EXPENSE", categories)[0], preset: "food" }, rate: 4012, receipt: null })
    assert.equal(usd.exchange_rate, null)
    assert.equal(usd.subcategory, "lunch")
    assert.equal(slipInstant({ date: null, time: null }, new Date("2026-10-21T03:00:00Z")), "2026-10-21T03:00:00.000Z")
    assert.equal(slipNote(slip({ direction: "IN", party: "CHAN THY" })), "🧾 ABA ← CHAN THY")
  })
  it("every answer that is not a slip says so, in three languages", () => {
    assert.deepEqual(["busy", "feature", "utility_bill", "kscore", "unreadable", "x"].map(slipErrorKey), ["scanSlip.busy", "scanSlip.feature", "scanSlip.notSlip", "scanSlip.notSlip", "scanSlip.unreadable", "scanSlip.unreadable"])
    for (const k of Object.keys(dictionaries.km).filter((x) => x.startsWith("scanSlip."))) {
      const key = k as keyof typeof dictionaries.km
      assert.ok(dictionaries.en[key] && dictionaries.zh[key], k)
      assert.ok(!dictionaries.km[key].includes("&") && !dictionaries.km[key].includes("កម្មវិធី"), k)
    }
    assert.equal(dictionaries.km["scanSlip.reading"], "AI កំពុងអានវិក្កយបត្រ...")
  })
  it("wired: the tile opens the in-app sheet (a button, no t.me link); camera and gallery; read by /api/slip, saved only on 💾", () => {
    const grid = read("src/components/dashboard/quick-actions.tsx")
    assert.match(grid, /onClick=\{a\.key === "scan" \? onScan :/)
    assert.doesNotMatch(read("src/lib/quick-actions.ts"), /key: "scan"[^}]*href/)
    const home = read("src/app/(app)/home/page.tsx")
    assert.match(home, /onScan=\{\(\) => setScanOpen\(true\)\}/)
    assert.match(home, /<ScanSlipModal open=\{scanOpen\}/)
    const modal = read("src/components/transactions/scan-slip-modal.tsx")
    assert.match(modal, /capture="environment"/)
    assert.match(modal, /fetch\("\/api\/slip", \{ method: "POST", body \}\)/)
    assert.match(modal, /disabled=\{!wallet \|\| !choice \|\| saving\} onClick=\{save\}/) // nothing saved without a wallet and a category
    assert.match(modal, /href=\{SLIP_BOT_URL\} target="_blank"/) // the bot, a small link below
    // The route reads with the bot's reader and saves nothing.
    const route = read("src/app/api/slip/route.ts")
    assert.match(route, /readSlipImage\(file\.type,/)
    assert.doesNotMatch(route, /\.insert\(|\.upsert\(|bot_propose|createEntry/)
    assert.match(read("src/lib/server/slip-bot.ts"), /return readSlipImage\(file\.type, Buffer\.from\(file\.bytes\)\.toString\("base64"\)\)/)
  })
})
