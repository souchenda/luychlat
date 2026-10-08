/**
 * ABA Business / corporate iBanking "TRANSACTION DETAILS" PDF (transaction-detail_<FT>.pdf):
 * one transfer, exported by the payer. Read from the PDF's text lines (pdfjs, top to
 * bottom). Pure (aba-transaction-pdf.test.ts).
 *
 *   Transaction summary:  Transfer to SOU CHENDA AND TIM SREYLEAK
 *   Original amount:      186.00 USD
 *   From account:         K2SM CLOUD INVESTMENTS COMPANY LIMITED (002 850 166)
 *   To account:           016824222
 *   Transaction date:     Sep 26, 2026 12:16 PM
 *   Reference #:          100FT39125992444
 *   Remark:               Fz Shrimps / 24KG
 *
 * A full account statement (opening / closing balance, many rows) is never one of these.
 */

export type AbaTransfer = {
  amount: number
  currency: "USD" | "KHR"
  /** The company (or person) that paid. */
  payer: string
  payerAccount: string | null
  /** The receiving account, digits only. */
  toAccount: string
  toName: string | null
  /** ISO with the Cambodia offset, e.g. 2026-09-26T12:16:00+07:00. */
  postedAt: string
  reference: string
  remark: string | null
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** "Label:  value" on one line (the PDF puts both on the same row). */
function field(lines: string[], label: string): string | null {
  const re = new RegExp(`^\\s*${label}\\s*:?\\s*(.+?)\\s*$`, "i")
  for (const line of lines) {
    const m = re.exec(line)
    if (m && m[1].trim() && !/^:$/.test(m[1].trim())) return m[1].replace(/^:\s*/, "").trim()
  }
  return null
}

/** "Sep 26, 2026 12:16 PM" → 2026-09-26T12:16:00+07:00. */
function when(v: string | null): string | null {
  const m = v && /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(v)
  if (!m) return null
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  let hour = Number(m[4])
  if (m[6]) hour = (hour % 12) + (m[6].toUpperCase() === "PM" ? 12 : 0)
  if (!month || hour > 23 || Number(m[5]) > 59) return null
  const pad = (n: number | string) => String(n).padStart(2, "0")
  const iso = `${m[3]}-${pad(month)}-${pad(m[2])}T${pad(hour)}:${m[5]}:00+07:00`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/** Is this text (all pages) a statement rather than one transfer? Statements are never read here. */
export const looksLikeStatement = (text: string) => /opening balance|closing balance|account statement|statement period|beginning balance|ending balance/i.test(text)

export function parseAbaTransferPdf(lines: string[]): AbaTransfer | null {
  const text = lines.join("\n")
  if (!/TRANSACTION DETAILS/i.test(text) || !/Reference\s*#/i.test(text) || looksLikeStatement(text)) return null
  const amountText = field(lines, "Original amount")
  const am = amountText && /([\d,]+(?:\.\d{1,2})?)\s*(USD|KHR)/i.exec(amountText)
  if (!am) return null
  const currency = am[2].toUpperCase() as "USD" | "KHR"
  const amount = Number(am[1].replace(/,/g, ""))
  if (!(amount > 0 && amount < 1e10)) return null

  const reference = (field(lines, "Reference\\s*#") ?? "").replace(/\s+/g, "")
  if (!/^[A-Z0-9]{8,30}$/i.test(reference)) return null
  const postedAt = when(field(lines, "Transaction date"))
  if (!postedAt) return null
  const toAccount = (field(lines, "To account") ?? "").replace(/\D/g, "")
  if (toAccount.length < 6 || toAccount.length > 20) return null

  // "K2SM CLOUD INVESTMENTS COMPANY LIMITED (002 850 166)"
  const from = field(lines, "From account") ?? ""
  const fm = /^(.*?)\s*\(([\d\s]+)\)\s*$/.exec(from)
  const payer = (fm ? fm[1] : from).trim().slice(0, 120)
  if (!payer) return null
  const summary = field(lines, "Transaction summary")
  const toName = summary && /^Transfer to\s+(.+)$/i.exec(summary)?.[1].trim().slice(0, 120)

  return {
    amount: currency === "USD" ? Math.round(amount * 100) / 100 : Math.round(amount),
    currency,
    payer,
    payerAccount: fm ? fm[2].replace(/\D/g, "") : null,
    toAccount,
    toName: toName || null,
    postedAt,
    reference: reference.toUpperCase(),
    remark: field(lines, "Remark")?.slice(0, 200) ?? null,
  }
}

/** The ABA export's file name: transaction-detail_<FT reference>.pdf. */
export const isAbaTransferFileName = (name: string) => /^transaction-detail_[A-Z0-9]{8,30}\.pdf$/i.test(name.trim())
