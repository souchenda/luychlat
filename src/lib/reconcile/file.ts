/**
 * Reads a statement file into rows of text, on the device. CSV and Excel
 * (xlsx/xls) go through SheetJS; PDF comes in R2.
 */
export type StatementFile = { rows: string[][]; format: "CSV" | "XLSX"; sha256: string; name: string }

export class StatementFileError extends Error {
  constructor(readonly code: "too_large" | "pdf" | "unreadable" | "empty") {
    super(code)
  }
}

const MAX_BYTES = 5 * 1024 * 1024
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
  if (file.size > MAX_BYTES) throw new StatementFileError("too_large")
  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 8))
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 // %PDF
  if (isPdf) throw new StatementFileError("pdf")
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
