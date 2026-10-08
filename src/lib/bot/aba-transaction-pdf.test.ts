import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isAbaTransferFileName, parseAbaTransferPdf } from "./aba-transaction-pdf"

// The text rows of transaction-detail_100FT39125992444.pdf, as pdfjs reads them (top to bottom).
const SAMPLE = [
  "ABA BUSINESS",
  "TRANSACTION DETAILS",
  "ACCOUNT DETAILS",
  "Account Holder Name : K2SM CLOUD INVESTMENTS",
  "COMPANY LIMITED",
  "Account Number : 002 850 166",
  "Transfer to SOU CHENDA AND TIM -186.00 USD",
  "SREYLEAK",
  "Sep 26, 2026",
  "Transaction summary: Transfer to SOU CHENDA AND TIM SREYLEAK",
  "Original amount: 186.00 USD",
  "From account: K2SM CLOUD INVESTMENTS COMPANY LIMITED (002 850 166)",
  "To account: 016824222",
  "Transaction date: Sep 26, 2026 12:16 PM",
  "Reference #: 100FT39125992444",
  "Remark: Fz Shrimps / 24KG",
  "DISCLAIMER: This document is for informational purpose only and cannot be used as an official proof of payment or transaction.",
  "Exported by: PHORLA TOUN, Sep 26, 2026 01:10 PM | Page: 1/1",
]

describe("ABA corporate transaction-detail PDF", () => {
  it("reads Sonny Toun's payment", () => {
    assert.deepEqual(parseAbaTransferPdf(SAMPLE), {
      amount: 186,
      currency: "USD",
      payer: "K2SM CLOUD INVESTMENTS COMPANY LIMITED",
      payerAccount: "002850166",
      toAccount: "016824222",
      toName: "SOU CHENDA AND TIM SREYLEAK",
      postedAt: "2026-09-26T12:16:00+07:00",
      reference: "100FT39125992444",
      remark: "Fz Shrimps / 24KG",
    })
  })
  it("riel, a morning time", () => {
    const lines = SAMPLE.map((l) => l.replace("186.00 USD", "744,000 KHR").replace("12:16 PM", "09:05 AM"))
    const r = parseAbaTransferPdf(lines)
    assert.equal(r?.amount, 744000)
    assert.equal(r?.currency, "KHR")
    assert.equal(r?.postedAt, "2026-09-26T09:05:00+07:00")
  })
  it("never a statement or another document", () => {
    assert.equal(parseAbaTransferPdf([...SAMPLE, "Opening balance 1,000.00 USD"]), null)
    assert.equal(parseAbaTransferPdf(SAMPLE.filter((l) => !l.startsWith("Reference"))), null)
    assert.equal(parseAbaTransferPdf(["Invoice", "Total 186.00 USD"]), null)
  })
  it("the export's file name", () => {
    assert.equal(isAbaTransferFileName("transaction-detail_100FT39125992444.pdf"), true)
    assert.equal(isAbaTransferFileName("statement_2026-09.pdf"), false)
  })
})
