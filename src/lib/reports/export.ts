import { format, parseISO } from "date-fns"
import type { WorkSheet } from "xlsx"

import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Debt, DebtRepayment, Transaction, Wallet } from "@/lib/data/types"
import { debtStatus, remaining } from "@/lib/debts"

/**
 * Excel exports via SheetJS (installed from the official SheetJS CDN build,
 * 0.20.x; the npm-registry "xlsx" package is stuck at 0.18.5 with known
 * advisories). Loaded on demand so it never weighs on page loads.
 */
type Lang = "km" | "en"
type Cell = string | number | Date | null
const L = (lang: Lang, km: string, en: string) => (lang === "km" ? km : en)

const USD_FORMAT = "#,##0.00"
const KHR_FORMAT = "#,##0"
const DATE_TIME_FORMAT = "dd/mm/yyyy hh:mm"
const DATE_FORMAT = "dd/mm/yyyy"

/** Builds a sheet from rows, then applies column widths and per-cell number/date formats. */
async function buildSheet(rows: Cell[][], widths: number[], formats: (row: number, col: number) => string | undefined) {
  const XLSX = await import("xlsx")
  const sheet: WorkSheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })
  sheet["!cols"] = widths.map((wch) => ({ wch }))
  rows.forEach((row, r) =>
    row.forEach((_, c) => {
      const fmt = r === 0 ? undefined : formats(r, c)
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (fmt && cell) cell.z = fmt
    }),
  )
  return { XLSX, sheet }
}

/** Ledger export: Date, Type, Category, Wallet, Amount, Currency, Note, Debt Link. */
export async function exportTransactionsXlsx(input: {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
  debts: Debt[]
  lang: Lang
  fileName: string
}) {
  const { transactions, wallets, categories, debts, lang } = input
  const wallet = new Map(wallets.map((w) => [w.id, w.name]))
  const category = new Map(categories.map((c) => [c.id, categoryLabel(c, lang)]))
  const debt = new Map(debts.map((d) => [d.id, d.party_name]))
  const typeLabel = {
    INCOME: L(lang, "ចំណូល", "Income"),
    EXPENSE: L(lang, "ចំណាយ", "Expense"),
    TRANSFER: L(lang, "ផ្ទេរប្រាក់", "Transfer"),
  }
  const sorted = [...transactions].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))

  const rows: Cell[][] = [
    [
      L(lang, "កាលបរិច្ឆេទ", "Date"),
      L(lang, "ប្រភេទ", "Type"),
      L(lang, "ក្រុម", "Category"),
      L(lang, "កាបូប", "Wallet"),
      L(lang, "ចំនួនទឹកប្រាក់", "Amount"),
      L(lang, "រូបិយប័ណ្ណ", "Currency"),
      L(lang, "កំណត់ចំណាំ", "Note"),
      L(lang, "ភ្ជាប់បំណុល", "Debt Link"),
    ],
    ...sorted.map((tx) => [
      new Date(tx.transaction_date),
      typeLabel[tx.type],
      tx.type === "TRANSFER"
        ? `→ ${wallet.get(tx.to_wallet_id ?? "") ?? ""}`
        : (category.get(tx.category_id ?? "") ?? L(lang, "គ្មានក្រុម", "Uncategorized")),
      wallet.get(tx.wallet_id) ?? "",
      tx.type === "INCOME" ? tx.amount : -tx.amount,
      tx.currency,
      tx.note ?? "",
      tx.debt_id ? (debt.get(tx.debt_id) ?? "") : "",
    ]),
  ]

  const { XLSX, sheet } = await buildSheet(rows, [18, 12, 24, 18, 14, 10, 32, 22], (r, c) =>
    c === 0 ? DATE_TIME_FORMAT : c === 4 ? (sorted[r - 1].currency === "USD" ? USD_FORMAT : KHR_FORMAT) : undefined,
  )
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, L(lang, "ប្រតិបត្តិការ", "Transactions"))
  XLSX.writeFile(book, input.fileName, { compression: true })
}

/** Debts workbook: one sheet of debts (active first, then settled), one of every repayment. */
export async function exportDebtsXlsx(input: {
  debts: Debt[]
  repayments: DebtRepayment[]
  wallets: Wallet[]
  lang: Lang
  fileName: string
}) {
  const { debts, repayments, wallets, lang } = input
  const wallet = new Map(wallets.map((w) => [w.id, w.name]))
  const debtById = new Map(debts.map((d) => [d.id, d]))
  const statusLabel = {
    ACTIVE: L(lang, "សកម្ម", "Active"),
    PARTIALLY_PAID: L(lang, "សងបានខ្លះ", "Partially paid"),
    SETTLED: L(lang, "បានសងរួច", "Settled"),
    OVERDUE: L(lang, "ហួសកំណត់", "Overdue"),
  }
  const sortedDebts = [...debts].sort(
    (a, b) => Number(debtStatus(a) === "SETTLED") - Number(debtStatus(b) === "SETTLED"),
  )
  const moneyFormat = (c: Debt["currency"] | undefined) => (c === "KHR" ? KHR_FORMAT : USD_FORMAT)

  const debtRows: Cell[][] = [
    [
      L(lang, "ប្រភេទ", "Type"),
      L(lang, "ឈ្មោះ", "Party"),
      L(lang, "ទូរស័ព្ទ", "Phone"),
      L(lang, "សរុប", "Total"),
      L(lang, "បានសង", "Paid"),
      L(lang, "នៅខ្វះ", "Remaining"),
      L(lang, "រូបិយប័ណ្ណ", "Currency"),
      L(lang, "ការប្រាក់", "Interest"),
      L(lang, "ថ្ងៃខ្ចី", "Start"),
      L(lang, "ថ្ងៃកំណត់", "Due"),
      L(lang, "ស្ថានភាព", "Status"),
      L(lang, "កំណត់ចំណាំ", "Note"),
    ],
    ...sortedDebts.map((d) => [
      d.type === "PAYABLE" ? L(lang, "ត្រូវសងគេ", "I owe") : L(lang, "គេជំពាក់យើង", "Owed to me"),
      d.party_name,
      d.contact_phone ?? "",
      d.total_amount,
      d.paid_amount,
      remaining(d),
      d.currency,
      d.interest_rate
        ? `${d.interest_rate}% / ${d.interest_period === "MONTH" ? L(lang, "ខែ", "month") : L(lang, "ឆ្នាំ", "year")}`
        : "",
      parseISO(d.start_date),
      d.due_date ? parseISO(d.due_date) : "",
      statusLabel[debtStatus(d)],
      d.note ?? "",
    ]),
  ]
  const debts$ = await buildSheet(debtRows, [14, 22, 16, 12, 12, 12, 10, 14, 12, 12, 14, 28], (r, c) =>
    c >= 3 && c <= 5 ? moneyFormat(sortedDebts[r - 1].currency) : c === 8 || c === 9 ? DATE_FORMAT : undefined,
  )

  const sortedRepayments = [...repayments].sort((a, b) => a.payment_date.localeCompare(b.payment_date))
  const repaymentRows: Cell[][] = [
    [
      L(lang, "ឈ្មោះ", "Party"),
      L(lang, "កាលបរិច្ឆេទ", "Date"),
      L(lang, "ចំនួនទឹកប្រាក់", "Amount"),
      L(lang, "រូបិយប័ណ្ណ", "Currency"),
      L(lang, "កាបូប", "Wallet"),
      L(lang, "កំណត់ចំណាំ", "Note"),
    ],
    ...sortedRepayments.map((r) => {
      const d = debtById.get(r.debt_id)
      return [d?.party_name ?? "", new Date(r.payment_date), r.amount_paid, d?.currency ?? "", wallet.get(r.wallet_id) ?? "", r.note ?? ""]
    }),
  ]
  const repay$ = await buildSheet(repaymentRows, [22, 18, 12, 10, 18, 28], (r, c) =>
    c === 1 ? DATE_TIME_FORMAT : c === 2 ? moneyFormat(debtById.get(sortedRepayments[r - 1].debt_id)?.currency) : undefined,
  )

  const { XLSX } = debts$
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, debts$.sheet, L(lang, "បំណុល", "Debts"))
  XLSX.utils.book_append_sheet(book, repay$.sheet, L(lang, "ប្រវត្តិសង", "Repayments"))
  XLSX.writeFile(book, input.fileName, { compression: true })
}

/** Loan amortization table: summary block, then one row per installment. */
export async function exportAmortizationXlsx(input: {
  schedule: { monthlyPayment: number; totalInterest: number; totalPayment: number; rows: { n: number; date: string; payment: number; principal: number; interest: number; balance: number }[] }
  principal: number
  currency: "USD" | "KHR"
  description: string
  lang: Lang
  fileName: string
}) {
  const { schedule, currency, lang } = input
  const fmt = currency === "USD" ? USD_FORMAT : KHR_FORMAT
  const rows: Cell[][] = [
    [L(lang, "តារាងរំលស់កម្ចី", "Loan amortization schedule"), input.description],
    [L(lang, "ប្រាក់ដើម", "Principal"), input.principal],
    [L(lang, "ត្រូវបង់ប្រចាំខែ", "Monthly payment"), schedule.monthlyPayment],
    [L(lang, "ការប្រាក់សរុប", "Total interest"), schedule.totalInterest],
    [L(lang, "ប្រាក់ត្រូវសងសរុប", "Total repayment"), schedule.totalPayment],
    [],
    [
      L(lang, "ខែទី", "Month"),
      L(lang, "កាលបរិច្ឆេទ", "Date"),
      L(lang, "ប្រាក់ត្រូវបង់", "Payment"),
      L(lang, "ប្រាក់ដើម", "Principal"),
      L(lang, "ការប្រាក់", "Interest"),
      L(lang, "សមតុល្យនៅសល់", "Balance"),
    ],
    ...schedule.rows.map((r) => [r.n, parseISO(r.date), r.payment, r.principal, r.interest, r.balance]),
  ]
  const { XLSX, sheet } = await buildSheet(rows, [26, 14, 14, 14, 14, 16], (r, c) => {
    if (r >= 1 && r <= 4 && c === 1) return fmt
    if (r >= 7) return c === 1 ? DATE_FORMAT : c >= 2 ? fmt : undefined
    return undefined
  })
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, L(lang, "តារាងរំលស់", "Amortization"))
  XLSX.writeFile(book, input.fileName, { compression: true })
}

export function exportFileName(kind: string, workspace: string, suffix: string) {
  return `luysmart-${kind}-${workspace.toLowerCase()}-${suffix}-${format(new Date(), "yyyyMMdd-HHmm")}.xlsx`
}
