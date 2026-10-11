import assert from "node:assert/strict"
import { describe, it } from "node:test"

import BOT_COMMANDS from "../bot-commands.json"
import { billsOverviewText, NOTHING_DUE, type OverviewBill } from "./bills-overview"

// The founder's Personal workspace on 11/10/2026 (bot_bills_overview).
const BILLS: OverviewBill[] = [
  { title: "Cambodian Labor Care PLC", kind: "LOAN", amount: 244, currency: "USD", due: "2026-10-13", paid_until: "2026-09-10" },
  { title: "អគ្គិសនី · ផ្ទះ 37", kind: "ELECTRICITY", amount: 692_100, currency: "KHR", due: "2026-10-15", paid_until: null },
  { title: "Chip Mong Bank — បញ្ញើមានកាលកំណត់ (ដល់កំណត់ ២១ តុលា ២០២៦)", kind: "DEPOSIT", amount: 38_192_137.57, currency: "KHR", due: "2026-10-21", paid_until: null },
]

describe("bot /bills — the overview", () => {
  const text = billsOverviewText(BILLS, "2026-10-11", "ផ្ទាល់ខ្លួន")
  it("bills due within a week, with amounts and days left", () => {
    assert.match(text, /^🧾 វិក្កយបត្រ និងការរំលឹក · ផ្ទាល់ខ្លួន/)
    assert.match(text, /🟠 ក្នុង ៧ ថ្ងៃខាងមុខ\n• Cambodian Labor Care PLC — \$244\.00 · 13\/10 \(នៅសល់ 2 ថ្ងៃ\)\n• អគ្គិសនី · ផ្ទះ 37 — 692,100៛ · 15\/10 \(នៅសល់ 4 ថ្ងៃ\)/)
  })
  it("the fixed deposit apart, as money coming in (10 days)", () => {
    assert.match(text, /💰 បញ្ញើមានកាលកំណត់ \(Fixed Deposit\)\n• Chip Mong Bank — បញ្ញើមានកាលកំណត់ \(ដល់កំណត់ ២១ តុលា ២០២៦\) — 38,192,137\.57៛ · 21\/10 \(នៅសល់ 10 ថ្ងៃ\)/)
  })
  it("overdue first; a bill paid this cycle says so", () => {
    const t = billsOverviewText(
      [
        { title: "ទឹក", kind: "WATER", amount: 30_000, currency: "KHR", due: "2026-10-08", paid_until: null },
        { title: "អ៊ីនធឺណិត", kind: "INTERNET", amount: 20, currency: "USD", due: "2026-11-05", paid_until: "2026-10-05" },
      ],
      "2026-10-11",
      null,
    )
    assert.match(t, /🔴 ហួសកំណត់\n• ទឹក — 30,000៛ · 08\/10 \(ហួស 3 ថ្ងៃ\)/)
    assert.match(t, /🗓️ ក្រោយនេះ\n• អ៊ីនធឺណិត — \$20\.00 · 05\/11 \(នៅសល់ 25 ថ្ងៃ\) · ✅ បង់រួច/)
  })
  it("bills under «🔔 វិក្កយបត្រប្រចាំខែដែលត្រូវបង់»", () => {
    assert.match(text, /\n\n🔔 វិក្កយបត្រប្រចាំខែដែលត្រូវបង់\n\n🟠/)
  })
  it("no bills: nothing to pay 🎉, and how to add one", () => {
    const t = billsOverviewText([], "2026-10-11", null)
    assert.ok(t.includes(`🔔 វិក្កយបត្រប្រចាំខែដែលត្រូវបង់\n${NOTHING_DUE}`))
    assert.match(t, /បន្ថែមវិក្កយបត្រ/)
  })
  it("only a deposit: nothing to pay, the deposit still listed", () => {
    const t = billsOverviewText(BILLS.filter((b) => b.kind === "DEPOSIT"), "2026-10-11", null)
    assert.ok(t.includes(NOTHING_DUE) && t.includes("💰 បញ្ញើមានកាលកំណត់"))
  })
})

describe("bot command menu (src/lib/bot-commands.json — the deploy script and /admin both set it)", () => {
  it("has /bills, /atm and /voice, each command once", () => {
    const names = BOT_COMMANDS.map((c) => c.command)
    for (const c of ["bills", "atm", "voice", "start", "help"]) assert.ok(names.includes(c), c)
    assert.equal(new Set(names).size, names.length)
    assert.equal(BOT_COMMANDS.find((c) => c.command === "bills")?.description.includes("វិក្កយបត្រ និងការរំលឹកបង់ប្រាក់"), true)
  })
  it("valid for Telegram: lowercase names ≤ 32, descriptions ≤ 256, no «&» in Khmer", () => {
    for (const c of BOT_COMMANDS) {
      assert.match(c.command, /^[a-z0-9_]{1,32}$/)
      assert.ok(c.description.length <= 256)
      assert.ok(!c.description.split(" · ")[0].includes("&"), c.command)
    }
  })
})
