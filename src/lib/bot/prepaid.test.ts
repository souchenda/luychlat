import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseEntry, type BotCategory, type BotWallet } from "./parse-entry"
import { carReportText, parseTopUp, prepaidTypeOf, TOLL_TAG } from "./prepaid"

const aba: BotWallet = { id: "aba", name: "ABA", currency: "USD" }
const cash: BotWallet = { id: "cash", name: "សាច់ប្រាក់", currency: "KHR" }
const ev: BotWallet = { id: "ev", name: "កាបូបសាកឡាន (EV App Wallet)", currency: "USD", icon: "prepaid_ev" }
const toll: BotWallet = { id: "toll", name: "កាបូបផ្លូវល្បឿនលឿន (Expressway ANPR)", currency: "USD", icon: "prepaid_toll" }
const transport: BotCategory = { id: "tr", name: "ការធ្វើដំណើរ", type: "EXPENSE", preset_key: "transport" }
const other: BotCategory = { id: "ot", name: "ផ្សេងៗ", type: "EXPENSE", preset_key: "other_expense" }

describe("prepaid top-ups (ថប់អាប់)", () => {
  it("EV: a transfer from ABA into the EV wallet", () => {
    const t = parseTopUp("ថប់អាប់សាកឡាន 50$ ABA", [cash, aba, ev, toll])
    assert.ok(t?.ok)
    assert.equal(t.type, "EV")
    assert.equal(t.amount, 50)
    assert.equal(t.currency, "USD")
    assert.equal(t.source.id, "aba")
    assert.equal(t.target?.id, "ev")
  })
  it("expressway: Khmer digits, the wallet not created yet", () => {
    const t = parseTopUp("ថប់អាប់ល្បឿនលឿន ៣០$ ABA", [cash, aba])
    assert.ok(t?.ok)
    assert.equal(t.type, "TOLL")
    assert.equal(t.amount, 30)
    assert.equal(t.target, null)
  })
  it("never takes the money from a prepaid wallet; not a top-up without the word", () => {
    const t = parseTopUp("top up ev 20$", [ev, aba])
    assert.ok(t?.ok)
    assert.equal(t.source.id, "aba")
    assert.equal(parseTopUp("សាកឡានក្រៅ 8.5$", [aba, ev]), null)
    assert.deepEqual(parseTopUp("ថប់អាប់សាកឡាន ABA", [aba]), { ok: false, reason: "no_amount" })
  })
})

describe("prepaid spending", () => {
  const ctx = { wallets: [aba, cash, ev, toll], categories: [transport, other], debts: [], rate: 4000 }
  it("public charging comes out of the EV wallet, under transport", () => {
    const e = parseEntry("សាកឡានក្រៅ 8.5$", ctx)
    assert.ok(e.ok && e.kind === "EXPENSE")
    assert.equal(e.wallet.id, "ev")
    assert.equal(e.amount, 8.5)
    assert.equal(e.category?.id, "tr")
  })
  it("a toll comes out of the expressway wallet, tagged", () => {
    const e = parseEntry("កាត់ល្បឿនលឿន 12$", ctx)
    assert.ok(e.ok && e.kind === "EXPENSE")
    assert.equal(e.wallet.id, "toll")
    assert.equal(e.category?.id, "tr")
    assert.ok(e.note.startsWith(TOLL_TAG))
  })
  it("a wallet named in the message still wins; no prepaid wallet → as before", () => {
    const named = parseEntry("សាកឡានក្រៅ 8.5$ ABA", ctx)
    assert.ok(named.ok && named.kind === "EXPENSE" && named.wallet.id === "aba")
    const plain = parseEntry("សាកឡានក្រៅ 8.5$", { ...ctx, wallets: [aba, cash] })
    assert.ok(plain.ok && plain.kind === "EXPENSE" && plain.wallet.id === "aba")
  })
  it("the expressway is never read as charging", () => {
    assert.equal(prepaidTypeOf("ផ្លូវល្បឿនលឿន"), "TOLL")
    assert.equal(prepaidTypeOf("ev charging"), "EV")
    assert.equal(prepaidTypeOf("កាហ្វេ 2$"), null)
  })
})

describe("/car", () => {
  it("money lines only with numbers opted in", () => {
    const off = carReportText({ status: "ok", numbers: false, home_kwh: 45.2 }, "ខែតុលា 2026")
    assert.match(off, /⚡ ភ្លើងសាកនៅផ្ទះ៖ 45\.2 kWh\n/)
    assert.doesNotMatch(off, /\$/)
    const on = carReportText({ status: "ok", numbers: true, home_kwh: 45.2, home_khr: 33000, public_usd: 8.5, toll_usd: 12, ev_balance: 41.5, toll_balance: null }, "ខែតុលា 2026")
    assert.match(on, /⚡ ភ្លើងសាកនៅផ្ទះ៖ 45\.2 kWh \(≈ 33,000៛\)/)
    assert.match(on, /🔌 សាកនៅក្រៅ៖ \$8\.50/)
    assert.match(on, /🛣️ ថ្លៃផ្លូវល្បឿនលឿន៖ \$12\.00/)
    assert.match(on, /💳 សមតុល្យសល់ក្នុងកាបូបសាកឡាន៖ \$41\.50/)
    assert.doesNotMatch(on, /កាបូបល្បឿនលឿន/)
  })
})
