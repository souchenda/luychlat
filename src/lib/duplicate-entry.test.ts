import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { isDuplicateCallback } from "./server/entry-card"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("«Recorded twice?» — asked, never deleted silently (founder, 4/11/2026)", () => {
  const sql = read("supabase/migrations/20270289000000_duplicate_entry.sql")

  it("the rule: same workspace, currency and amount, within 24 h and 3 h of each other; a slip vs a typed one, or a double send", () => {
    assert.match(sql, /o\.workspace_id = t\.workspace_id and o\.id <> t\.id and o\.type = 'EXPENSE' and o\.currency = t\.currency and o\.amount = t\.amount/)
    assert.match(sql, /o\.created_at > now\(\) - interval '24 hours'/)
    assert.match(sql, /<= 3 \* 3600/)
    assert.match(sql, /\(o\.bank_ref is null\) <> \(t\.bank_ref is null\)/) // two bank references are two real payments
    assert.match(sql, /abs\(extract\(epoch from \(o\.created_at - t\.created_at\)\)\) <= 300\)/)
    assert.match(sql, /o\.debt_id is null/)
  })

  it("only the person's own: a member to ask, the creator to delete, an expense of the last day, never a repayment", () => {
    assert.match(sql, /not public\.is_workspace_member\(ws\)/)
    assert.match(sql, /m\.workspace_id = ws and m\.user_id = link\.uid/)
    assert.match(sql, /where id = p_tx_id and created_by = link\.uid and type = 'EXPENSE' and debt_id is null and created_at > now\(\) - interval '24 hours'/)
    assert.match(sql, /revoke all on function public\.tx_duplicate_core\(uuid\) from public, anon, authenticated;/)
  })

  it("the bot asks after each new expense, the buttons fit Telegram's 64 bytes; the app offers one tap to delete", () => {
    assert.ok(isDuplicateCallback("dd:0f8fad5b-d9cb-469f-a165-70867728950e:x"))
    assert.ok(!isDuplicateCallback("dd:nope:x"))
    assert.ok("dd:0f8fad5b-d9cb-469f-a165-70867728950e:x".length <= 64)
    assert.match(read("src/lib/server/bot-commands.ts"), /await duplicateNudge\(chatId, savedTx\.id, lang\)/)
    assert.equal((read("src/lib/server/slip-bot.ts").match(/await duplicateNudge\(/g) ?? []).length, 2)
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /isDuplicateCallback\(update\.callback_query\.data\)/)
    const sheet = read("src/components/transactions/entry-form-sheet.tsx")
    assert.match(sheet, /if \(created && type === "EXPENSE"\) void warnDuplicate\(created\.id\)/)
    assert.match(sheet, /rpc\("possible_duplicate", \{ p_tx_id: id \}\)/)
  })
})
