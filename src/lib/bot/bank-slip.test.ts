import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { accountNameKey, cleanSlip, resolveSlipAcrossWorkspaces, resolveWallet, sameAccountName, strongMatch } from "./bank-slip"

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
  // The founder's real wallets (19/10/2026): the bot's default is Personal; the business wallet is «ABA DL USD»,
  // with no account number saved; two personal ACLEDA wallets carry 016824222.
  const personal = {
    id: "ws-personal",
    name: "ផ្ទាល់ខ្លួន",
    wallets: [
      { id: "aba-usd", name: "ABA Bank", icon: "aba", currency: "USD" as const, account_no: "078824222" },
      { id: "wing", name: "វីង 078824222", icon: "wing", currency: "USD" as const, account_no: "078824222" },
      { id: "ac-016-usd", name: "អេស៊ីលីដា 016***4222 USD", icon: "acleda", currency: "USD" as const, account_no: "016824222" },
      { id: "ac-016-khr", name: "អេស៊ីលីដា 016***4222 KHR", icon: "acleda", currency: "KHR" as const, account_no: "016824222" },
      { id: "ac-usd", name: "អេស៊ីលីដា USD", icon: "acleda", currency: "USD" as const, account_no: "078824222" },
    ],
  }
  const business = {
    id: "ws-dl",
    name: "DL MEAT SUPPLY",
    wallets: [
      { id: "dl-khr", name: "ABA DL KHR", icon: "aba", currency: "KHR" as const, account_no: "016472333" },
      { id: "dl-usd", name: "ABA DL USD", icon: "aba", currency: "USD" as const, account_no: null },
      { id: "dl-acleda", name: "ACLEDA 386***6222", icon: "acleda", currency: "USD" as const, account_no: null },
    ],
  }
  const slip = { bank: "ABA BANK", currency: "USD" as const, account: "016824222", accountName: "DL USD" }

  it("«From account: DL USD (016 824 222)» → «ABA DL USD» in DL MEAT SUPPLY, certain — never ABA Bank 078***4222", () => {
    for (const ws of [[personal, business], [business, personal]]) {
      const pick = resolveSlipAcrossWorkspaces(slip, ws)
      assert.ok(pick && "wallet" in pick, JSON.stringify(pick))
      assert.deepEqual([pick.wallet.wallet.id, pick.wallet.workspaceName], ["dl-usd", "DL MEAT SUPPLY"])
    }
    const printedWithNumber = resolveSlipAcrossWorkspaces({ ...slip, accountName: "DL USD (016 824 222)" }, [personal, business])
    assert.ok(printedWithNumber && "wallet" in printedWithNumber && printedWithNumber.wallet.wallet.id === "dl-usd")
  })
  it("the account name as people name a wallet: the bank's words and the number aside", () => {
    assert.equal(accountNameKey("DL USD (016 824 222)", "ABA BANK"), "dl usd")
    assert.equal(accountNameKey("ABA DL USD", "ABA BANK"), "dl usd")
    assert.ok(sameAccountName("DL USD", "ABA DL USD", "ABA BANK"))
    assert.ok(!sameAccountName("DL USD", "ABA DL KHR", "ABA BANK"))
    assert.ok(!sameAccountName("USD", "ABA USD", "ABA BANK")) // a currency alone names nothing
    assert.ok(!sameAccountName("DL USD", "ABA Bank", "ABA BANK"))
    assert.ok(!sameAccountName(null, "ABA DL USD", "ABA BANK"))
  })
  it("matched by the full printed number when the slip prints no name", () => {
    const withNumber = { ...business, wallets: business.wallets.map((w) => (w.id === "dl-usd" ? { ...w, account_no: "016824222" } : w)) }
    const pick = resolveSlipAcrossWorkspaces({ bank: "ABA BANK", currency: "USD", account: "016 824 222" }, [personal, withNumber])
    assert.ok(pick && "wallet" in pick && pick.wallet.wallet.id === "dl-usd")
  })
  it("never an ACLEDA wallet for an ABA slip, whatever the digits; a masked number never reaches another workspace", () => {
    const pick = resolveSlipAcrossWorkspaces({ bank: "ABA BANK", currency: "USD", account: "016824222" }, [personal, business])
    const offered = !pick ? [] : "wallet" in pick ? [pick.wallet] : pick.choices
    assert.ok(offered.every((c) => c.wallet.icon !== "acleda"), JSON.stringify(offered.map((c) => c.wallet.id)))
    assert.equal(strongMatch({ bank: "ABA BANK", account: "016*4222" }, { id: "x", name: "ABA DL USD", icon: "aba", currency: "USD", account_no: "016824222" }), false)
  })
  it("an ACLEDA slip from 016 824 222 still goes to the ACLEDA wallet of that number", () => {
    const pick = resolveSlipAcrossWorkspaces({ bank: "ACLEDA", currency: "USD", account: "016824222" }, [personal, business])
    assert.ok(pick && "wallet" in pick && pick.wallet.wallet.id === "ac-016-usd")
  })
})
