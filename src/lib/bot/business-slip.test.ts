import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { businessChoiceLabel, categoryFor, isBusinessWorkspace, SLIP_OUT, SLIP_OUT_BUSINESS } from "./bank-slip"
import type { BotCategory } from "./parse-entry"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const km = dictionaries.km as Record<string, string>

// DL MEAT SUPPLY's expense categories on production (26/10/2026).
const dl: BotCategory[] = ["inventory", "delivery", "payroll", "operating", "rent", "utilities", "owner_draw", "other_expense", "marketing", "tax"].map((p, i) => ({
  id: `c${i}`,
  name: p,
  type: "EXPENSE",
  preset_key: p,
}))

describe("A slip paid from a Business account — the business's categories (founder, 26/10/2026 — Task #510)", () => {
  it("the founder's six buttons, in his order and words; «🥩» for a meat business, «🛒» for any other", () => {
    assert.deepEqual(
      SLIP_OUT_BUSINESS.map((c) => km[businessChoiceLabel(c, "DL MEAT SUPPLY")]),
      ["🥩 ទិញស្តុកសាច់", "🚚 ថ្លៃដឹក/សាំង", "👨‍💼 ប្រាក់ខែកម្មករ", "🏪 ថ្លៃតូប/ទឹកកក", "🙋‍♂️ ម្ចាស់ដកចាយ", "📦 ផ្សេងៗ"],
    )
    assert.equal(km[businessChoiceLabel(SLIP_OUT_BUSINESS[0], "ហាងលក់សាច់គោ")], "🥩 ទិញស្តុកសាច់")
    assert.equal(km[businessChoiceLabel(SLIP_OUT_BUSINESS[0], "Sokha Mart")], "🛒 ទិញស្តុកទំនិញ")
    assert.deepEqual(SLIP_OUT_BUSINESS.filter((c) => c.draw).map((c) => c.presets), [["owner_draw"]])
    for (const l of ["en", "zh"] as const) assert.ok((dictionaries[l] as Record<string, string>)["bot.slipBiz.draw"], l)
  })

  it("each button lands on the business's own category: stock → inventory, delivery, payroll, stall/ice → operating, other", () => {
    const presets = SLIP_OUT_BUSINESS.filter((c) => !c.draw).map((c) => categoryFor(c, "EXPENSE", dl)?.preset_key)
    assert.deepEqual(presets, ["inventory", "delivery", "payroll", "operating", "other_expense"])
    // Never a household category: no food / coffee / home button for a business.
    assert.ok(SLIP_OUT_BUSINESS.every((c) => !c.presets.includes("food") && !c.presets.includes("housing")))
    assert.deepEqual([isBusinessWorkspace("BUSINESS"), isBusinessWorkspace("PERSONAL"), isBusinessWorkspace("FAMILY"), isBusinessWorkspace(null)], [true, false, false, false])
    assert.equal(SLIP_OUT.length, 6) // the household set is unchanged
  })

  it("regression: the tap looks the category up in the ENTRY's workspace (bot_tx_scope), never the chat's first (Personal)", () => {
    const s = read("src/lib/server/slip-bot.ts")
    const tap = s.slice(s.indexOf("async function handleAutoCallback"), s.indexOf("export const isSlipCallback"))
    assert.doesNotMatch(tap, /workspacesOf\(ctx\)\[0\]/)
    assert.match(tap, /botDb\(\)\.rpc\("bot_tx_scope", \{ p_key: botKey\(\), p_chat_id: chatId, p_tx_id: txId \}\)/)
    assert.match(tap, /const ws = workspacesOf\(ctx\)\.find\(\(w\) => w\.id === scope\.workspace_id\)/)
    assert.match(tap, /if \(Boolean\(biz\) !== op\.startsWith\("b"\)\) return answer\(tr\(lang, "bot\.expired"\), true\)/)
    assert.match(tap, /!\/\^\(f\|o\|x\|c\\d\|b\\d\|d\|n\|p\[0-9a-f\]\{8\}\)\$\/\.test\(op \?\? ""\)/)
  })

  it("the uncategorised business slip shows the business buttons; household payee rules never auto-file it; no «🍲» button", () => {
    const s = read("src/lib/server/slip-bot.ts")
    assert.match(s, /saveWithoutCategory\(chatId, lang, pendingId, shown, info, isBusinessWorkspace\(ws\.type\) \? ws : null\)/)
    assert.match(s, /SLIP_OUT_BUSINESS\.map\(\(c, i\) => \(\{ text: tr\(lang, businessChoiceLabel\(c, biz\.name\)\), callback_data: c\.draw \? `sa:\$\{txId\}:d` : `sa:\$\{txId\}:b\$\{i\}` \}\)\)/)
    assert.match(s, /if \(!decision \|\| \(isBusinessWorkspace\(ws\.type\) && decision\.source !== "memory"\)\) return false/)
    assert.match(s, /\.\.\.\(t\.food \|\| t\.business \? \[\] : \[\{ text: tr\(lang, "bot\.autoToFood"\)/)
  })
})

describe("The owner's draw — the business entry and its Personal mirror (founder, 26/10/2026 — Task #510)", () => {
  const sql = read("supabase/migrations/20270262000000_owner_draw.sql")
  it("only the business's owner, Business → his own Personal wallet, the same currency, both workspaces writable", () => {
    assert.match(sql, /if bw\.type <> 'BUSINESS' then raise exception 'not_business'/)
    assert.match(sql, /if bw\.user_id <> link\.uid then raise exception 'not_owner'/)
    assert.match(sql, /pw\.type <> 'PERSONAL' or pw\.user_id <> link\.uid or coalesce\(w\.kind::text, ''\) = 'CREDIT_CARD'/)
    assert.match(sql, /if w\.currency <> t\.currency then raise exception 'currency_mismatch'/)
    assert.equal((sql.match(/public\.bot_ws_allowed\(link\.uid, link\.ws, link\.route_all, /g) ?? []).length, 2)
  })
  it("the business entry is the owner's draw (out of the P&L); the mirror is a transfer in, never personal income; one per draw", () => {
    assert.match(sql, /ensure_preset_category\(bw\.id, 'owner_draw', 'EXPENSE'/)
    assert.match(sql, /ensure_preset_category\(pw\.id, 'workspace_transfer_in', 'INCOME'/)
    assert.match(sql, /'← ' \|\| bw\.name, 'ម្ចាស់ដកចាយ', slip/)
    assert.match(sql, /create unique index if not exists transactions_draw_of_key on public\.transactions \(draw_of\) where draw_of is not null;/)
    assert.match(sql, /draw_of uuid references public\.transactions \(id\) on delete cascade/)
  })
  it("the mirror follows: another category → removed; amount, currency or date edited → the same", () => {
    assert.match(sql, /and not exists \(select 1 from public\.categories c where c\.id = new\.category_id and c\.preset_key = 'owner_draw'\) then\n\s+delete from public\.transactions where draw_of = new\.id;/)
    assert.match(sql, /update public\.transactions set amount = new\.amount, currency = new\.currency, transaction_date = new\.transaction_date where draw_of = new\.id;/)
  })
  it("the bot asks which Personal wallet (never guesses), offers «not in Personal», and words it for the founder", () => {
    const s = read("src/lib/server/slip-bot.ts")
    assert.match(s, /const wallets = \(personal\?\.wallets \?\? \[\]\)\.filter\(\(w\) => w\.currency === scope\.currency && w\.kind !== "CREDIT_CARD"\)/)
    assert.match(s, /callback_data: `sa:\$\{txId\}:p\$\{w\.id\.slice\(0, 8\)\}`/)
    assert.match(s, /rows\.push\(\[\{ text: tr\(lang, "bot\.drawSkip"\), callback_data: `sa:\$\{txId\}:n` \}\]\)/)
    assert.equal(km["bot.drawAsk"], "🙋‍♂️ ម្ចាស់ដកចាយ {amount} ពី {business} (មិនគិតជាចំណាយអាជីវកម្មទេ)\n\n💰 ប្រាក់នេះចូលកាបូបផ្ទាល់ខ្លួនណា?")
    for (const k of ["bot.drawAsk", "bot.drawDone", "bot.drawDoneOnly", "bot.drawNoWallet", "bot.drawSkip"]) assert.doesNotMatch(km[k], /លោក/, k)
  })
})
