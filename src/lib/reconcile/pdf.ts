/**
 * Bank statement PDFs → the same rows as a CSV, on the device.
 *
 * pdf.js gives positioned text. We rebuild the transaction table from it:
 * the header row ("Date … Balance") gives the column positions, a date at the
 * left edge starts a transaction, and the lines around it are its
 * description. ABA writes the description from the date row downwards;
 * ACLEDA centres it on the date row (a line above, one or two below).
 *
 * The output is a plain table — the account-details lines from page 1, then
 * Date | Description | Reference | Money in | Money out | Balance — so the
 * CSV pipeline (parse.ts, meta.ts) reads it unchanged. Statements with only
 * scanned images have no text: we report that instead of guessing.
 */

import { parseStatementAmount, parseStatementDate } from "./parse"

export type PdfItem = { x: number; y: number; w: number; str: string }
export type PdfPage = PdfItem[]

export class PdfStatementError extends Error {
  constructor(readonly code: "scanned" | "no_table" | "unreadable") {
    super(code)
  }
}

type Line = { y: number; items: PdfItem[] }

const HEADER = {
  date: /^date$/i,
  description: /description|details|particulars|narrative/i,
  in: /money\s*in|cash\s*in|credit|\(cr\)|deposit/i,
  out: /money\s*out|cash\s*out|debit|\(dr\)|withdraw/i,
  balance: /^balance$/i,
}
const DATE_CELL = /^([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|\d{1,2}[-/ ][A-Za-z]{3}[-/ ]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{4})$/
const AMOUNT_CELL = /^[+-]?\s?[\d,]+(\.\d+)?\s*(KHR|USD)?$/
const FOOTER_Y = 45

/** Bold text is often drawn twice at the same spot; keep one copy. */
function dedupe(items: PdfItem[]): PdfItem[] {
  const out: PdfItem[] = []
  for (const it of items) {
    if (!it.str.trim()) continue
    if (out.some((o) => o.str === it.str && Math.abs(o.x - it.x) < 2.5 && Math.abs(o.y - it.y) < 2.5)) continue
    out.push({ ...it, str: it.str.trim() })
  }
  return out
}

/** Items on (nearly) the same baseline, top to bottom, left to right. */
function toLines(items: PdfItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2)
    if (line) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x)
  return lines.sort((a, b) => b.y - a.y)
}

type Columns = { date: number; description: number; in: number; out: number; balance: number }

function findHeader(lines: Line[]): { index: number; cols: Columns } | null {
  for (let i = 0; i < lines.length; i++) {
    const items = lines[i].items
    const at = (re: RegExp) => items.find((it) => re.test(it.str))?.x
    const cols = { date: at(HEADER.date), description: at(HEADER.description), in: at(HEADER.in), out: at(HEADER.out), balance: at(HEADER.balance) }
    if (Object.values(cols).every((v) => v !== undefined)) return { index: i, cols: cols as Columns }
  }
  return null
}

/** Which amount column an amount item belongs to (closest header). */
function columnOf(x: number, cols: Columns): "in" | "out" | "balance" {
  const options = (["in", "out", "balance"] as const).map((k) => [k, Math.abs(cols[k] - x)] as const)
  return options.sort((a, b) => a[1] - b[1])[0][0]
}

export function referenceOf(description: string): string | null {
  const ref = description.match(/\bREF(?:#|\.)\s*([A-Z]*\d[A-Z0-9]{5,})/i)
  if (ref) return ref[1]
  const hash = description.match(/\b(?:HASH#?|Txn\.?\s*Hash)\s*([0-9a-f]{8,})/i)
  return hash ? hash[1] : null
}

const isoDate = (s: string) => parseStatementDate(s, "DMY") ?? ""

/**
 * Account details above the table on page 1, one row per line. A value that
 * wrapped onto the next line (no label of its own) is joined back.
 */
function detailRows(lines: Line[]): string[][] {
  const rows: string[][] = []
  let prev: { line: Line; cells: string[] } | null = null
  for (const line of lines) {
    const cells = line.items.map((it) => it.str).filter((s) => s !== "|")
    if (!cells.length) continue
    // e.g. ABA "Account Holder Name  SOU CHENDA AND TIM" / "SREYLEAK": a lone
    // item under the previous line's value, just below it.
    const lastValue = prev && prev.line.items.length > 1 ? prev.line.items[prev.line.items.length - 1] : null
    if (prev && lastValue && line.items.length === 1 && prev.line.y - line.y <= 16 && line.items[0].x >= lastValue.x - 60) {
      prev.cells[prev.cells.length - 1] = `${prev.cells[prev.cells.length - 1]} ${cells[0]}`
      continue
    }
    rows.push(cells)
    prev = { line, cells }
  }
  return rows
}

/** Positioned text of every page → statement rows (see the file comment). */
export function pdfPagesToRows(pages: PdfPage[]): string[][] {
  const textItems = pages.reduce((n, p) => n + p.filter((it) => it.str.trim()).length, 0)
  if (textItems < 20) throw new PdfStatementError("scanned")

  const first = toLines(dedupe(pages[0]))
  const header = findHeader(first) ?? findHeader(toLines(dedupe(pages[1] ?? [])))
  if (!header) throw new PdfStatementError("no_table")
  const { cols } = header
  // ACLEDA centres each description on its date row; ABA starts it there.
  // Decided by the SWIFT code: descriptions name other banks ("BANK ACLEDA Bank Plc." on ABA).
  const firstText = first.map((l) => l.items.map((i) => i.str).join(" ")).join(" ")
  const centred = /ACLBKHPP/.test(firstText) && !/ABAAKHPP/.test(firstText)

  const out: string[][] = detailRows(first.slice(0, findHeader(first)?.index ?? 0))
  out.push(["Date", "Description", "Reference", "Money In", "Money Out", "Balance"])

  for (const page of pages) {
    const lines = toLines(dedupe(page))
    const h = findHeader(lines)
    // Only the table part of the page; page footers are cut off by height.
    const body = (h ? lines.slice(h.index + 1) : lines).filter((l) => l.y > FOOTER_Y && !/^(page\b|ACCOUNT ACTIVITY|TRANSACTION DETAILS)/i.test(l.items[0].str))
    const dateRows = body.filter((l) => l.items[0].x < cols.description - 5 && DATE_CELL.test(l.items[0].str))
    if (!dateRows.length) continue

    type Tx = { row: Line; parts: PdfItem[]; amounts: Record<"in" | "out" | "balance", number | null> }
    const txs: Tx[] = dateRows.map((row) => ({ row, parts: [], amounts: { in: null, out: null, balance: null } }))
    const owner = (line: Line): Tx | undefined => {
      if (centred) return txs.reduce((best, t) => (Math.abs(t.row.y - line.y) < Math.abs(best.row.y - line.y) ? t : best))
      // From a date row down to the next one.
      return [...txs].reverse().find((t) => t.row.y >= line.y - 0.5)
    }

    for (const line of body) {
      const tx = owner(line)
      if (!tx) continue
      for (const it of line.items) {
        if (line === tx.row && it === line.items[0]) continue // the date itself
        if (it.x > cols.description + 150 && AMOUNT_CELL.test(it.str) && line === tx.row) {
          tx.amounts[columnOf(it.x, cols)] = parseStatementAmount(it.str)
          continue
        }
        if (it.str !== "|") tx.parts.push(it)
      }
    }

    for (const tx of txs) {
      const description = tx.parts
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      const fmt = (n: number | null) => (n === null ? "" : String(n))
      out.push([isoDate(tx.row.items[0].str), description, referenceOf(description) ?? "", fmt(tx.amounts.in), fmt(tx.amounts.out), fmt(tx.amounts.balance)])
    }
  }
  if (out.length < 3) throw new PdfStatementError("no_table")
  return out
}

/** Reads the PDF with pdf.js (loaded only when a PDF is picked). */
export async function readPdfPages(data: ArrayBuffer): Promise<PdfPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    // Served from this site (CSP worker-src 'self').
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString()
  }
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise
  } catch {
    throw new PdfStatementError("unreadable")
  }
  const pages: PdfPage[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 200); n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(
      content.items.flatMap((it) =>
        "str" in it ? [{ x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10, w: it.width, str: it.str }] : [],
      ),
    )
  }
  await doc.destroy()
  return pages
}
