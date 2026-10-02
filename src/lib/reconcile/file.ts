/**
 * Reads a statement file into rows of text, on the device. CSV and Excel
 * (xlsx/xls) go through SheetJS; text PDFs (ABA, ACLEDA…) through pdf.js (pdf.ts).
 */
import { pdfPagesToRows, PdfStatementError, readPdfPages } from "./pdf"

export type StatementFile = { rows: string[][]; format: "CSV" | "XLSX" | "PDF"; sha256: string; name: string }

export class StatementFileError extends Error {
  constructor(readonly code: "too_large" | "pdf" | "pdf_scanned" | "pdf_no_table" | "unreadable" | "empty") {
    super(code)
  }
}

const MAX_BYTES = 5 * 1024 * 1024
// Bank PDFs carry logos and QR images: a month of ABA activity is ~3.5 MB.
const MAX_PDF_BYTES = 15 * 1024 * 1024
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
  if (file.size > MAX_PDF_BYTES) throw new StatementFileError("too_large")
  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 8))
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 // %PDF
  if (isPdf) {
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
  if (file.size > MAX_BYTES) throw new StatementFileError("too_large")
  const isZip = head[0] === 0x50 && head[1] === 0x4b // xlsx
  const isOle = head[0] === 0xd0 && head[1] === 0xcf // legacy xls

  const XLSX = await import("xlsx")
  let workbook
  try {
    if (isZip || isOle) {
      workbook = XLSX.read(buffer, { type: "array", cellDates: true })
    } else {
      const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "")
      // raw: keep "1,234.50" and "30/09/2026" as typed; parse.ts reads them.
      workbook = XLSX.read(text, { type: "string", raw: true })
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
