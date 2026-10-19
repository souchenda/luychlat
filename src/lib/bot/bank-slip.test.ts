import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanSlip, resolveSlipAcrossWorkspaces, resolveWallet, strongMatch } from "./bank-slip"

describe("cleanSlip — themed ABA transfer (customer's slip, '-867,700 KHR', 11:27 AM)", () => {
  const read = { is_slip: true, amount: -867700, currency: "KHR", direction: "OUT", bank: "ABA", date: "2026-10-08", time: "11:27 AM", party: "Unknown", account: "001 879 507", owner: "SOU CHENDA AND TIM SREYLEAK", to_account: "016 472 333" }

  it("drops the minus sign: 867,700 KHR", () => {
    const s = cleanSlip(read)!
    assert.equal(s.amount, 867700)
    assert.equal(s.currency, "KHR")
    assert.equal(s.time, "11:27")
    assert.equal(s.toAccount, "016472333")
  })
  it("a number taken from the time ('11:27' → $11) is refused, never booked", () => {
    assert.equal(cleanSlip({ ...read, amount: 11, currency: "USD" }), null)
    assert.equal(cleanSlip({ ...read, amount: 27, currency: "USD" }), null)
    assert.ok(cleanSlip({ ...read, amount: 11, currency: "USD", time: "09:05" }))
  })
  it("no bank printed but a 3-3-3 account → ABA", () => {
    assert.equal(cleanSlip({ ...read, bank: null })!.bank, "ABA")
    assert.equal(cleanSlip({ ...read, bank: null, account: "0123456789" })!.bank, null)
  })
})

describe("cleanSlip — ABA bill payment / Smart Mobile top-up ('-5.00 USD')", () => {
  // What Gemini returns for an ABA "Smart Mobile (PIN-less)" top-up slip paid from "DL USD (016 824 222)".
  const read = { is_slip: true, amount: "-5.00", currency: "USD", direction: "OUT", bank: "ABA", date: "2026-10-08", time: "08:42 AM", party: "Smart Mobile", account: "016 824 222", account_name: "DL USD", consumer: "010 234 567" }

  it("a valid slip: $5.00 out to Smart Mobile, the phone number kept", () => {
    const s = cleanSlip(read)!
    assert.equal(s.amount, 5)
    assert.equal(s.currency, "USD")
    assert.equal(s.direction, "OUT")
    assert.equal(s.party, "Smart Mobile")
    assert.equal(s.consumer, "010 234 567")
    assert.equal(s.time, "08:42")
  })
  it("booked to the wallet named on the slip, never another USD wallet", () => {
    const s = cleanSlip(read)!
    const wallets = [
      { id: "aba-usd", name: "ABA Bank", currency: "USD" as const, account_no: "078824222" },
      { id: "dl-usd", name: "DL USD", currency: "USD" as const, account_no: null },
      { id: "dl-khr", name: "DL USD", currency: "KHR" as const, account_no: null },
    ]
    const pick = resolveWallet(s, wallets)
    assert.ok(pick && "wallet" in pick)
    assert.equal(pick.wallet.id, "dl-usd")
  })
  it("a real $5 top-up at 5 PM is kept; a bare 5 at 05:xx with nothing else is still refused", () => {
    assert.equal(cleanSlip({ ...read, time: "05:12 PM" })?.amount, 5)
    assert.equal(cleanSlip({ ...read, amount: "-5.00", consumer: null, time: "05:12 PM" })?.amount, 5)
    assert.equal(cleanSlip({ ...read, amount: 5, consumer: null, time: "05:12 PM" }), null)
  })
})

describe("resolveWallet — never another bank's wallet by number alone (founder, 13/10/2026)", () => {
  // The founder's Personal wallets: 016 824 222 is saved on an ACLEDA wallet; the ABA wallet has 078…
  const wallets = [
    { id: "aba-usd", name: "ABA Bank", icon: "aba", currency: "USD" as const, account_no: "078824222" },
    { id: "ac-016", name: "អេស៊ីលីដា 016***4222 USD", icon: "acleda", currency: "USD" as const, account_no: "016824222" },
    { id: "ac-usd", name: "អេស៊ីលីដា USD", icon: "acleda", currency: "USD" as const, account_no: "078824222" },
  ]
  it("an ABA BANK slip from 016 824 222 → asked among ABA's wallets only — the ACLEDA wallet is never offered (founder, 19/10/2026)", () => {
    const pick = resolveWallet({ bank: "ABA BANK", currency: "USD", account: "016824222", accountName: "DL USD" }, wallets)
    assert.ok(pick && "choices" in pick)
    assert.deepEqual(pick.choices.map((w) => w.id), ["aba-usd"])
  })
  it("an ACLEDA slip from the same number is still booked straight to it", () => {
    const pick = resolveWallet({ bank: "ACLEDA", currency: "USD", account: "016824222" }, wallets)
    assert.ok(pick && "wallet" in pick)
    assert.equal(pick.wallet.id, "ac-016")
  })
  it("a slip naming no bank keeps matching by number", () => {
    const pick = resolveWallet({ bank: null, currency: "USD", account: "016824222" }, wallets)
    assert.ok(pick && "wallet" in pick)
    assert.equal(pick.wallet.id, "ac-016")
  })
})

describe("A slip's wallet in another of the person's workspaces (founder, 19/10/2026 — the DL USD slip)", () => {
  // The bot's default is Personal; the slip's account is the business wallet «DL USD (016 824 222)».
  const personal = {
    id: "ws-personal",
    name: "ផ្ទាល់ខ្លួន",
    wallets: [
      { id: "aba-usd", name: "ABA Bank", icon: "aba", currency: "USD" as const, account_no: "078824222" },
      { id: "ac-016", name: "អេស៊ីលីដា 016***4222 USD", icon: "acleda", currency: "USD" as const, account_no: "016824222" },
    ],
  }
  const business = {
    id: "ws-dl",
    name: "DL MEAT SUPPLY",
    wallets: [
      { id: "dl-usd", name: "DL USD (016 824 222)", icon: "aba", currency: "USD" as const, account_no: "016824222" },
      { id: "dl-acleda", name: "ACLEDA DL", icon: "acleda", currency: "USD" as const, account_no: "016824222" },
    ],
  }
  const slip = { bank: "ABA BANK", currency: "USD" as const, account: "016824222", accountName: "DL USD (016 824 222)" }

  it("offers «🏢 DL MEAT SUPPLY · DL USD (016 824 222)» first, then Personal's ABA wallet — never an ACLEDA wallet", () => {
    const pick = resolveSlipAcrossWorkspaces(slip, [personal, business])
    assert.ok(pick && "choices" in pick)
    assert.deepEqual(pick.choices.map((c) => [c.workspaceName, c.wallet.id, c.elsewhere]), [
      ["DL MEAT SUPPLY", "dl-usd", true],
      ["ផ្ទាល់ខ្លួន", "aba-usd", false],
    ])
    assert.ok(pick.choices.every((c) => c.wallet.icon !== "acleda"))
  })
  it("matched by the full printed number too, when the slip prints no name", () => {
    const pick = resolveSlipAcrossWorkspaces({ bank: "ABA BANK", currency: "USD", account: "016824222" }, [personal, business])
    assert.ok(pick && "choices" in pick && pick.choices[0].wallet.id === "dl-usd")
  })
  it("a masked or 4-digit number is never enough to reach into another workspace", () => {
    assert.equal(strongMatch({ bank: "ABA BANK", account: "016*4222" }, business.wallets[0]), false)
    const pick = resolveSlipAcrossWorkspaces({ bank: "ABA BANK", currency: "USD", account: "***4222" }, [personal, business])
    assert.ok(!pick || ("choices" in pick ? pick.choices : [pick.wallet]).every((c) => !c.elsewhere))
  })
  it("a wallet the slip names exactly in the default workspace stays the answer (no detour to the business)", () => {
    const home = { ...personal, wallets: [...personal.wallets, { id: "p-dl", name: "DL USD (016 824 222)", icon: "aba", currency: "USD" as const, account_no: "016824222" }] }
    const pick = resolveSlipAcrossWorkspaces(slip, [home, business])
    assert.ok(pick && "wallet" in pick)
    assert.equal(pick.wallet.wallet.id, "p-dl")
  })
  it("without other workspaces, the slip decides as before", () => {
    const pick = resolveSlipAcrossWorkspaces({ bank: "ACLEDA", currency: "USD", account: "016824222" }, [personal])
    assert.ok(pick && "wallet" in pick && pick.wallet.wallet.id === "ac-016")
  })
})
