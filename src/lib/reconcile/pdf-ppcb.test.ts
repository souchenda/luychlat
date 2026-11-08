import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildStatement, guessMapping } from "./parse"
import { extractMeta } from "./meta"
import { pdfPagesToRows, PdfStatementError, type PdfItem } from "./pdf"

// PPCBank «ACCOUNT STATEMENT» as pdf.js positions it (layout of the founder's real exports, 8/11/2026 — names,
// numbers and amounts here are made up). Its quirks: a «No» column before the date, «Transaction Date/Time» with a
// time, the amounts LEFT of a centred «Remark», «-» in an empty amount cell, a «Total» line, the issuer only in the
// footer, and a Remark naming the PAYER's bank («…, ABA Bank …»).
const it_ = (x: number, y: number, str: string): PdfItem => ({ x, y, w: str.length * 4, str })

const details = (currency: "USD" | "KHR", number: string, opening: string, ending: string): PdfItem[] => [
  it_(226, 768, "ACCOUNT STATEMENT"),
  it_(209, 749, "09 October 2026 to 08 November 2026"),
  it_(32, 726, "ACCOUNT DETAIL"), it_(357, 726, "ACCOUNT SUMMARY"),
  it_(32, 708, "Account Name"), it_(130, 708, "DARA KEO"), it_(357, 708, "Opening Balance"), it_(549, 708, opening),
  it_(32, 692, "Account Number"), it_(130, 692, number), it_(357, 692, "Total Deposit"), it_(549, 692, "3.50"),
  it_(32, 676, "Account Type"), it_(130, 676, "Saving Account"), it_(357, 676, "Total Withdrawal"), it_(549, 676, "1.25"),
  it_(32, 660, "Account Currency"), it_(130, 660, currency), it_(357, 660, "Ending Balance"), it_(549, 660, ending),
  it_(32, 605, "Branch"), it_(130, 605, "Sample Branch"),
  it_(32, 585, "ACCOUNT ACTIVITY"),
  it_(40, 557, "No"), it_(68, 557, "Transaction Date/Time"), it_(184, 557, "Deposit"), it_(249, 557, "Withdrawal"),
  it_(327, 557, "Balance"), it_(427, 557, "Remark"), it_(522, 557, "Branch"),
]
const footer: PdfItem[] = [
  it_(30, 81, "Disclaimer: This document is for informational purpose only and cannot be used as an official proof"),
  it_(30, 33, "Phnom Penh Commercial Bank Plc"), it_(200, 33, "+855 23 909 909"),
  it_(30, 18, "This document was generated 08 Nov 2026, 03:13 PM"),
]

const withActivity: PdfItem[] = [
  ...details("USD", "9-999-00001234-5", "0.00", "2.25"),
  it_(385, 536, "KHQR Payment From - Sok"),
  it_(385, 521, "Chea - SAMPLE SHOP , ABA"),
  it_(43, 520, "1"), it_(67, 520, "08 Nov 2026, 08:39 AM"), it_(211, 520, "3.50"), it_(296, 520, "-"), it_(333, 520, "3.50"),
  it_(385, 506, "Bank 000111222"),
  it_(385, 486, "Transfer to ACLEDA BANK"),
  it_(43, 470, "2"), it_(67, 470, "09 Nov 2026, 10:36 PM"), it_(211, 470, "-"), it_(290, 470, "1.25"), it_(333, 470, "2.25"),
  it_(385, 456, "PLC. 000333444"),
  it_(82, 430, "Total"), it_(213, 430, "3.50"), it_(285, 430, "1.25"),
  ...footer,
]

const noRecord: PdfItem[] = [...details("KHR", "9-999-00001235-8", "0", "0"), it_(255, 530, "No Record Available"), ...footer]

const read = (items: PdfItem[]) => {
  const rows = pdfPagesToRows([items])
  const mapping = guessMapping(rows)
  assert.ok(mapping, "the table is found")
  return { rows, mapping, meta: extractMeta(rows, mapping.headerRow, mapping.dateOrder, "Account_Statement.pdf") }
}

describe("PPCBank statement PDF (founder, 8/11/2026)", () => {
  it("reads every transaction: the date after the «No» column, money in / out, the centred Remark, no «Total»", () => {
    const { rows, mapping } = read(withActivity)
    const table = rows.slice(mapping.headerRow + 1)
    assert.deepEqual(table, [
      ["2026-11-08", "KHQR Payment From - Sok Chea - SAMPLE SHOP , ABA Bank 000111222", "", "3.5", "", "3.5"],
      ["2026-11-09", "Transfer to ACLEDA BANK PLC. 000333444", "", "", "1.25", "2.25"],
    ])
    const statement = buildStatement(rows, mapping, 2)
    assert.equal(statement.lines.length, 2)
    assert.equal(statement.closing_balance, 2.25)
  })

  it("is PPCBank — never ABA because a Remark names the payer's bank — with its account, currency and balances", () => {
    const { meta } = read(withActivity)
    assert.equal(meta.bank, "PPCB")
    assert.equal(meta.accountName, "DARA KEO")
    assert.equal(meta.accountNumber, "9999000012345")
    assert.equal(meta.currency, "USD")
    assert.equal(meta.openingBalance, 0)
    assert.equal(meta.closingBalance, 2.25)
  })

  it("a new account («No Record Available») still sets up the wallet: details read, no transaction", () => {
    const { rows, mapping, meta } = read(noRecord)
    assert.equal(rows.length, mapping.headerRow + 1)
    assert.deepEqual([meta.bank, meta.currency, meta.accountNumber, meta.closingBalance], ["PPCB", "KHR", "9999000012358", 0])
    assert.equal(buildStatement(rows, mapping, 0).lines.length, 0)
  })

  it("a PDF with no table at all is still refused (never a guessed wallet)", () => {
    const letter = [...Array.from({ length: 30 }, (_, i) => it_(40, 700 - i * 15, `Dear customer, line ${i}`))]
    assert.throws(() => pdfPagesToRows([letter]), (e) => e instanceof PdfStatementError && e.code === "no_table")
  })
})

describe("ABA-shaped statements read as before (date first, amounts right of the description)", () => {
  it("one row", () => {
    const page: PdfItem[] = [
      it_(40, 700, "Account Name"), it_(150, 700, "DARA KEO"),
      it_(40, 685, "Account Number"), it_(150, 685, "000 111 222"),
      it_(40, 670, "Currency"), it_(150, 670, "USD"),
      ...Array.from({ length: 12 }, (_, i) => it_(300 + (i % 3) * 60, 700 - Math.floor(i / 3) * 12, `detail ${i}`)),
      it_(40, 640, "Date"), it_(110, 640, "Description"), it_(330, 640, "Money In"), it_(400, 640, "Money Out"), it_(480, 640, "Balance"),
      it_(40, 620, "Nov 08, 2026"), it_(110, 620, "PURCHASE CAFE"), it_(400, 620, "4.00"), it_(480, 620, "96.00"),
      it_(110, 608, "REF# FT26312ABCDE"),

      it_(40, 20, "ABAAKHPP"),
    ]
    const rows = pdfPagesToRows([page])
    const header = rows.findIndex((r) => r[0] === "Date")
    assert.deepEqual(rows[header + 1], ["2026-11-08", "PURCHASE CAFE REF# FT26312ABCDE", "FT26312ABCDE", "", "4", "96"])
  })
})
