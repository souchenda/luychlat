import { NextResponse } from "next/server"

import type { Locale } from "@/lib/i18n/dictionaries"
import { toInvoice, type ReceiptData } from "@/lib/invoice"
import { receiptPng } from "@/lib/server/receipt-image"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// Skia is a native module (not edge).
export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The receipt image of one invoice (PNG). The signed-in user's session reads
 * it through invoice_receipt(), which only answers members of the invoice's
 * workspace — so the URL alone shows nothing to anyone else.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 })

  const { data, error } = await supabase.rpc("invoice_receipt", { p_invoice_id: id })
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const receipt = data as ReceiptData
  const lang = new URL(req.url).searchParams.get("lang")
  const locale: Locale = lang === "en" || lang === "zh" ? lang : "km"

  const png = receiptPng({ ...receipt, invoice: toInvoice(receipt.invoice) }, locale)
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${receipt.invoice.invoice_number.replace(/[^\w-]/g, "")}.png"`,
      "Cache-Control": "private, no-store",
    },
  })
}
