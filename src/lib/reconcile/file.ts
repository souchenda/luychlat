/**
 * Reads a statement file into rows of text, on the device — the file is never
 * uploaded. It is first checked by its bytes (file-safety.ts); then CSV and
 * Excel (xlsx/xls) go through SheetJS and text PDFs (ABA, ACLEDA…) through
 * pdf.js (pdf.ts). Only cell values and text are read: formulas, macros,
 * scripts and embedded objects are never run.
 */
import { inspectStatementBytes, MAX_STATEMENT_BYTES, type UnsafeReason } from "./file-safety"
import { pdfPagesToRows, PdfStatementError, readPdfPages } from "./pdf"

export type StatementFile = { rows: string[][]; format: "CSV" | "XLSX" | "PDF"; sha256: string; name: string }

export class StatementFileError extends Error {
  constructor(
    readonly code: "too_large" | "pdf" | "pdf_scanned" | "pdf_no_table" | "unreadable" | "empty" | "unsupported" | "unsafe" | "blocked",
    /** For "unsafe": what was found. */
    readonly reason?: UnsafeReason,
  ) {
    super(code)
  }
}

const MAX_ROWS = 20_000

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

const pad = (n: number) => String(n).padStart(2, "0")

function cellText(value: unknown): string {
  if (value instanceof Date) {
    // SheetJS builds dates in local time.
    return Number.isNaN(value.getTime()) ? "" : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

export async function readStatementFile(file: File): Promise<StatementFile> {
  if (file.size > MAX_STATEMENT_BYTES) throw new StatementFileError("too_large")
  const buffer = await file.arrayBuffer()
  const check = inspectStatementBytes(new Uint8Array(buffer), file.name)
  if (!check.ok) throw check.unsafe ? new StatementFileError("unsafe", check.unsafe) : new StatementFileError(check.error)
  if (check.kind === "pdf") {
    // Hash first: pdf.js may take over (detach) the buffer it reads.
    const sha256 = await sha256Hex(buffer)
    try {
      const rows = pdfPagesToRows(await readPdfPages(buffer.slice(0)))
      return { rows, format: "PDF", sha256, name: file.name }
    } catch (error) {
      if (error instanceof PdfStatementError) throw new StatementFileError(error.code === "scanned" ? "pdf_scanned" : error.code === "no_table" ? "pdf_no_table" : "unreadable")
      throw new StatementFileError("unreadable")
    }
  }
  const isZip = check.kind === "zip" // xlsx
  const isOle = check.kind === "ole" // legacy xls
  // Values only: no formulas, styles, HTML or VBA kept; rows capped.
  const safe = { cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false, sheetRows: MAX_ROWS } as const

  const XLSX = await import("xlsx")
  let workbook
  try {
    if (isZip || isOle) {
      workbook = XLSX.read(buffer, { ...safe, type: "array", cellDates: true })
    } else {
      const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "")
      // raw: keep "1,234.50" and "30/09/2026" as typed; parse.ts reads them.
      workbook = XLSX.read(text, { ...safe, type: "string", raw: true })
    }
  } catch {
    throw new StatementFileError("unreadable")
  }

  let rows: string[][] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false })
    const text = data.slice(0, MAX_ROWS).map((r) => r.map(cellText))
    if (text.length > rows.length) rows = text
  }
  if (rows.length < 2) throw new StatementFileError("empty")
  return { rows, format: isZip || isOle ? "XLSX" : "CSV", sha256: await sha256Hex(buffer), name: file.name }
}
