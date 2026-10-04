import type { Currency } from "@/lib/data/types"

/** Quick invoice / receipt (public.invoices), shared by the app, the API and the bot. */
export type InvoiceStatus = "pending" | "paid" | "cancelled"
export type InvoiceItem = { name: string; qty?: number; price?: number }

export type Invoice = {
  id: string
  workspace_id: string
  created_by: string | null
  invoice_number: string
  customer_name: string | null
  customer_phone: string | null
  total_amount: number
  currency: Currency
  items: InvoiceItem[]
  notes: string | null
  status: InvoiceStatus
  target_wallet_id: string | null
  transaction_id: string | null
  paid_at: string | null
  created_at: string
}

/** What the receipt image is drawn from (public.invoice_receipt). */
export type ReceiptData = {
  invoice: Invoice
  merchant: string
  merchant_phone: string | null
  /** The creator's KHQR text, when they added one. */
  khqr: string | null
}

export const FREE_INVOICES_PER_MONTH = 5

export const toInvoice = (row: Invoice): Invoice => ({
  ...row,
  total_amount: Number(row.total_amount),
  items: Array.isArray(row.items) ? row.items.map((i) => ({ ...i, qty: i.qty == null ? undefined : Number(i.qty), price: i.price == null ? undefined : Number(i.price) })) : [],
})

/** Sum of qty × price over the priced items (null when none has a price). */
export function itemsTotal(items: InvoiceItem[]): number | null {
  const priced = items.filter((i) => typeof i.price === "number")
  return priced.length ? priced.reduce((sum, i) => sum + (i.qty ?? 1) * (i.price ?? 0), 0) : null
}
