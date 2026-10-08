// Server only: an ABA Business transaction-detail PDF → its text rows → the transfer.
// The bytes are checked first (no scripts, launch actions or attachments; one page, small);
// pdf.js reads text only (no fonts, images or scripts).
import { parseAbaTransferPdf, type AbaTransfer } from "@/lib/bot/aba-transaction-pdf"
import { readPdfPages } from "@/lib/reconcile/pdf"
import { inspectStatementBytes } from "@/lib/reconcile/file-safety"

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024

export type ReceiptRead = { ok: true; transfer: AbaTransfer } | { ok: false; reason: "unsafe" | "too_large" | "not_pdf" | "unreadable" | "not_a_receipt" }

/** The page's text as rows, top to bottom (items on the same baseline joined left to right). */
function rows(items: { x: number; y: number; str: string }[]): string[] {
  const byY = new Map<number, { x: number; str: string }[]>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round(it.y)
    byY.set(y, [...(byY.get(y) ?? []), { x: it.x, str: it.str }])
  }
  return [...byY.keys()]
    .sort((a, b) => b - a)
    .map((y) =>
      byY
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
}

export async function readAbaReceipt(bytes: Uint8Array, fileName: string): Promise<ReceiptRead> {
  if (bytes.length > MAX_RECEIPT_BYTES) return { ok: false, reason: "too_large" }
  const check = inspectStatementBytes(bytes, fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`)
  if (!check.ok) return { ok: false, reason: check.unsafe ? "unsafe" : check.error === "too_large" ? "too_large" : "unreadable" }
  if (check.kind !== "pdf") return { ok: false, reason: "not_pdf" }
  let pages
  try {
    pages = await readPdfPages(bytes.slice().buffer)
  } catch {
    return { ok: false, reason: "unreadable" }
  }
  // A receipt is one page; a statement is many.
  if (pages.length !== 1) return { ok: false, reason: "not_a_receipt" }
  const transfer = parseAbaTransferPdf(rows(pages[0]))
  return transfer ? { ok: true, transfer } : { ok: false, reason: "not_a_receipt" }
}
