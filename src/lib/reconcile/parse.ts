/**
 * Bank statement parsing (runs on the device; the file never leaves it).
 *
 * rows (string[][]) → header + column roles → normalized lines → running
 * balance check. Kept free of app imports so it can be tested with plain Node.
 *
 * R1 is generic: header names are guessed from common English/Khmer labels
 * and the user can fix the mapping. Bank-specific profiles (ABA, ACLEDA…)
 * come in R2, built from real sample exports.
 */

export type ColumnRole = "date" | "description" | "ref" | "amount" | "debit" | "credit" | "balance" | "ignore"
export type DateOrder = "DMY" | "MDY" | "YMD"

export type Mapping = {
  headerRow: number
  /** Role per column index (missing = ignore). */
  roles: ColumnRole[]
  dateOrder: DateOrder
}

export type StatementLine = {
  line_no: number
  /** yyyy-MM-dd */
  posted_on: string
  /** Signed, in the wallet currency: + money in, − money out. */
  amount: number
  description: string
  bank_ref: string | null
  running_balance: number | null
  /** 1-based row in the file (for error messages). */
  fileRow: number
}

export type BalanceCheck =
  | { kind: "ok" }
  | { kind: "none" }
  | { kind: "mismatch"; fileRow: number; expected: number; found: number }

export type ParseResult = {
  lines: StatementLine[]
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  balance: BalanceCheck
  /** Rows that had money but couldn't be read (file row numbers). */
  badRows: number[]
}

// ---------------------------------------------------------------------------
// Header guessing
// ---------------------------------------------------------------------------
const ALIASES: Record<Exclude<ColumnRole, "ignore">, string[]> = {
  date: ["date", "transaction date", "trans date", "txn date", "posting date", "post date", "value date", "booking date", "ថ្ងៃ", "ថ្ងៃខែ", "កាលបរិច្ឆេទ", "ថ្ងៃប្រតិបត្តិការ"],
  description: [
    "description", "details", "detail", "transaction details", "narrative", "narration", "remark", "remarks",
    "particulars", "memo", "purpose", "ការពិពណ៌នា", "ពិពណ៌នា", "បរិយាយ", "ព័ត៌មានលម្អិត",
  ],
  ref: ["reference", "ref", "ref no", "ref no.", "reference no", "reference number", "transaction id", "trx id", "txn id", "transaction no", "លេខយោង"],
  amount: ["amount", "transaction amount", "amt", "ចំនួនទឹកប្រាក់", "ទឹកប្រាក់"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "dr", "ដកប្រាក់", "ឥណពន្ធ"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "cr", "ដាក់ប្រាក់", "ឥណទាន"],
  balance: ["balance", "running balance", "available balance", "ledger balance", "សមតុល្យ"],
}

const normHeader = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[_:*#]/g, " ").replace(/\b(usd|khr)\b/g, " ").replace(/\s+/g, " ").trim()

export function roleOfHeader(cell: string): ColumnRole {
  const h = normHeader(cell)
  if (!h) return "ignore"
  for (const [role, names] of Object.entries(ALIASES) as [Exclude<ColumnRole, "ignore">, string[]][]) {
    if (names.includes(h)) return role
  }
  // Looser: "Withdrawal Amount", "Balance (USD)", "Transaction Date/Time"…
  for (const [role, names] of Object.entries(ALIASES) as [Exclude<ColumnRole, "ignore">, string[]][]) {
    if (names.some((n) => n.length > 3 && h.includes(n))) return role
  }
  return "ignore"
}

/** Finds the header row in the first 40 rows and guesses the column roles. */
export function guessMapping(rows: string[][]): Mapping | null {
  let best: { row: number; roles: ColumnRole[]; score: number } | null = null
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const roles = rows[i].map(roleOfHeader)
    // One column per role (first wins).
    const seen = new Set<ColumnRole>()
    const unique = roles.map((r) => (r !== "ignore" && seen.has(r) ? "ignore" : (seen.add(r), r)))
    const has = (r: ColumnRole) => unique.includes(r)
    const usable = has("date") && (has("amount") || has("debit") || has("credit"))
    const score = unique.filter((r) => r !== "ignore").length + (usable ? 10 : 0)
    if (usable && (!best || score > best.score)) best = { row: i, roles: unique, score }
  }
  if (!best) return null
  const dates = rows.slice(best.row + 1, best.row + 200).map((r) => r[best.roles.indexOf("date")] ?? "")
  return { headerRow: best.row, roles: best.roles, dateOrder: guessDateOrder(dates) }
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------
const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"
export const toAsciiDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))

/** "1,234.50", "(12.00)", "12.00-", "-$5", "5.00 CR", "1 234,50", "៛4,000" → number; "" → null. */
export function parseStatementAmount(raw: string): number | null {
  let s = toAsciiDigits(String(raw ?? "")).trim()
  if (!s || s === "-" || s === "—") return null
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (/\bDR\.?$/i.test(s)) {
    sign = -sign
    s = s.replace(/\bDR\.?$/i, "")
  } else s = s.replace(/\bCR\.?$/i, "")
  s = s.replace(/USD|KHR|US\$|[$៛\s ]/gi, "")
  if (s.endsWith("-")) {
    sign = -sign
    s = s.slice(0, -1)
  }
  if (s.startsWith("-")) {
    sign = -sign
    s = s.slice(1)
  } else if (s.startsWith("+")) s = s.slice(1)
  if (s.includes(",") && s.includes(".")) {
    // The later separator is the decimal point.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  } else if (s.includes(",")) {
    s = /,\d{3}(,|$)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".")
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return sign * Number(s)
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad = (n: number) => String(n).padStart(2, "0")
const year4 = (y: number) => (y < 100 ? 2000 + y : y)

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Returns yyyy-MM-dd, or null. Times after the date are ignored. */
export function parseStatementDate(raw: string, order: DateOrder): string | null {
  const s = toAsciiDigits(String(raw ?? "")).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})\b/)
  if (m) return order === "MDY" ? ymd(year4(+m[3]), +m[1], +m[2]) : ymd(year4(+m[3]), +m[2], +m[1])
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{2,4})\b/)
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    return mon < 0 ? null : ymd(year4(+m[3]), mon + 1, +m[1])
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (m) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    return mon < 0 ? null : ymd(+m[3], mon + 1, +m[2])
  }
  // Excel serial day number (1900 date system).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s))
    if (n > 36000 && n < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000)
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }
  }
  return null
}

/** 13/09/2026 → day first; 09/13/2026 → month first; ambiguous → day first (Cambodia). */
export function guessDateOrder(values: string[]): DateOrder {
  let dayFirst = 0
  let monthFirst = 0
  let isoLike = 0
  for (const v of values) {
    const s = toAsciiDigits(String(v ?? "")).trim()
    if (/^\d{4}[-/.]/.test(s)) isoLike++
    const m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ]\d{2,4}/)
    if (!m) continue
    if (+m[1] > 12) dayFirst++
    if (+m[2] > 12) monthFirst++
  }
  if (isoLike > 0 && dayFirst + monthFirst === 0) return "YMD"
  return monthFirst > dayFirst ? "MDY" : "DMY"
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------
const OPENING_ROW = /opening|beginning|brought forward|b\/f|balance forward|សមតុល្យដើម/i
const SUMMARY_ROW = /^(total|totals|closing balance|ending balance|sub ?total|សរុប)/i

export const FEE_PATTERN = /\b(fee|fees|charge|charges|commission|service charge)\b|កម្រៃ|សេវា/i

const round = (n: number, scale: number) => Math.round(n * 10 ** scale) / 10 ** scale

/**
 * Builds statement lines from the rows with the given mapping, oldest first,
 * then verifies the running balance. `scale` is 2 for USD, 0 for KHR.
 */
export function buildStatement(rows: string[][], mapping: Mapping, scale: number): ParseResult {
  const col = (role: ColumnRole) => mapping.roles.indexOf(role)
  const [cDate, cDesc, cRef, cAmount, cDebit, cCredit, cBalance] = (
    ["date", "description", "ref", "amount", "debit", "credit", "balance"] as ColumnRole[]
  ).map(col)
  const cell = (row: string[], c: number) => (c >= 0 ? String(row[c] ?? "").trim() : "")

  const lines: StatementLine[] = []
  const badRows: number[] = []
  let openingFromRow: number | null = null

  for (let i = mapping.headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !String(c ?? "").trim())) continue
    const description = cell(row, cDesc)
    const date = parseStatementDate(cell(row, cDate), mapping.dateOrder)

    let amount: number | null = null
    if (cAmount >= 0) amount = parseStatementAmount(cell(row, cAmount))
    if (amount === null && (cDebit >= 0 || cCredit >= 0)) {
      const debit = Math.abs(parseStatementAmount(cell(row, cDebit)) ?? 0)
      const credit = Math.abs(parseStatementAmount(cell(row, cCredit)) ?? 0)
      amount = debit || credit ? credit - debit : null
    }
    const balance = cBalance >= 0 ? parseStatementAmount(cell(row, cBalance)) : null
    const rowText = row.join(" ")

    if (!amount) {
      if (OPENING_ROW.test(rowText) && balance !== null) openingFromRow = round(balance, scale)
      continue // headers repeated on each page, totals, blank fillers
    }
    if (SUMMARY_ROW.test(cell(row, cDate) || description)) continue
    if (!date) {
      badRows.push(i + 1)
      continue
    }
    lines.push({
      line_no: 0,
      posted_on: date,
      amount: round(amount, scale),
      description: description.replace(/\s+/g, " ").slice(0, 300),
      bank_ref: cell(row, cRef).slice(0, 80) || null,
      running_balance: balance === null ? null : round(balance, scale),
      fileRow: i + 1,
    })
  }

  const ordered = chooseOrder(lines, scale)
  ordered.lines.forEach((l, i) => (l.line_no = i + 1))
  const dates = ordered.lines.map((l) => l.posted_on).sort()
  const first = ordered.lines[0]
  const last = ordered.lines[ordered.lines.length - 1]
  const hasBalances = ordered.lines.length > 0 && ordered.lines.every((l) => l.running_balance !== null)

  return {
    lines: ordered.lines,
    period_start: dates[0] ?? "",
    period_end: dates[dates.length - 1] ?? "",
    opening_balance: hasBalances ? round(first.running_balance! - first.amount, scale) : openingFromRow,
    closing_balance: hasBalances ? last.running_balance : null,
    balance: ordered.check,
    badRows,
  }
}

function checkRunning(lines: StatementLine[], scale: number): BalanceCheck {
  if (lines.length === 0 || lines.some((l) => l.running_balance === null)) return { kind: "none" }
  const tolerance = scale === 0 ? 0.5 : 0.005
  for (let i = 1; i < lines.length; i++) {
    const expected = round(lines[i - 1].running_balance! + lines[i].amount, scale)
    if (Math.abs(expected - lines[i].running_balance!) > tolerance) {
      return { kind: "mismatch", fileRow: lines[i].fileRow, expected, found: lines[i].running_balance! }
    }
  }
  return { kind: "ok" }
}

/**
 * Statements list newest-first or oldest-first, and some show withdrawals as
 * positive numbers. With a balance column the right reading is the one whose
 * running balance adds up; without it, dates decide the order.
 */
function chooseOrder(lines: StatementLine[], scale: number): { lines: StatementLine[]; check: BalanceCheck } {
  const byDate = lines.length > 1 && lines[0].posted_on > lines[lines.length - 1].posted_on ? [...lines].reverse() : lines
  const candidates = [byDate, byDate === lines ? [...lines].reverse() : lines]
  let firstCheck: BalanceCheck | null = null
  for (const candidate of candidates) {
    for (const flip of [1, -1]) {
      const variant = flip === 1 ? candidate : candidate.map((l) => ({ ...l, amount: -l.amount }))
      const check = checkRunning(variant, scale)
      firstCheck ??= check
      if (check.kind !== "mismatch") {
        // Dates must still read oldest → newest.
        const sorted = variant.every((l, i) => i === 0 || variant[i - 1].posted_on <= l.posted_on)
        if (sorted || check.kind === "none") return { lines: sorted ? variant : sortStable(variant), check }
      }
    }
  }
  return { lines: sortStable(byDate), check: firstCheck ?? { kind: "none" } }
}

const sortStable = (lines: StatementLine[]) =>
  lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.posted_on < b.l.posted_on ? -1 : a.l.posted_on > b.l.posted_on ? 1 : a.i - b.i))
    .map((x) => x.l)

/**
 * Identity of a line across overlapping statements: date, amount, the bank's
 * reference (or description), and its position among identical lines that
 * day, so two equal fees on one day stay two lines.
 */
export function fingerprintKeys(lines: StatementLine[], scale: number): string[] {
  const seen = new Map<string, number>()
  return lines.map((l) => {
    const id = (l.bank_ref || l.description).toLowerCase().replace(/\s+/g, " ").trim()
    const key = `${l.posted_on}|${l.amount.toFixed(scale)}|${id}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return `${key}|${n}`
  })
}
