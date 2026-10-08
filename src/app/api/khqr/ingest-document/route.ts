import { createHash } from "crypto"
import { NextResponse } from "next/server"

import { formatMoney } from "@/lib/money"
import { readAbaReceipt, MAX_RECEIPT_BYTES } from "@/lib/server/aba-pdf"
import { notifyOwner } from "@/lib/server/biz-group-bot"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey } from "@/lib/server/telegram-bot"

/**
 * ABA Business receipt ingest — the merchant's own tool (AUTOBOK) pushes an ABA
 * Business / corporate iBanking "TRANSACTION DETAILS" PDF (transaction-detail_<FT>.pdf)
 * that a B2B customer sent, and LuyChlat records it as the business's Sales, in the
 * wallet whose account number is the PDF's To account (moved there from the business
 * when that wallet is a personal one). Once per FT reference.
 *
 *   POST /api/khqr/ingest-document
 *   Authorization: Bearer lck_<64 hex>     (the business's key, as /api/khqr/ingest)
 *   Content-Type: multipart/form-data       field "file" (the PDF; its name is used)
 *            or: application/pdf            the raw PDF (optional header X-File-Name)
 *
 * Only single-transaction receipts: account statements, other PDFs and anything with
 * scripts / attachments are refused (422). The owner is told privately.
 *
 * Answers: 201 recorded · 200 duplicate · 401 bad key · 402 plan required · 403 not allowed ·
 * 413 too large · 415 not a PDF · 422 not a receipt / no wallet for the To account · 429 too many.
 */
export const runtime = "nodejs"

const KEY = /^lck_[a-f0-9]{64}$/
const hits = new Map<string, number[]>()
const PER_MINUTE = 30

type Recorded = {
  status: string
  transaction_id?: string
  workspace_id?: string
  workspace?: string
  wallet?: string
  moved_to?: string | null
  amount?: number
  currency?: "USD" | "KHR"
  posted_at?: string
  reference?: string
  to_account?: string
}

async function fileOf(request: Request): Promise<{ bytes: Uint8Array; name: string } | "too_large" | null> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_RECEIPT_BYTES + 64_000) return "too_large"
  const type = request.headers.get("content-type") ?? ""
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    const file = form?.get("file") ?? form?.get("document")
    if (!file || typeof file === "string") return null
    if (file.size > MAX_RECEIPT_BYTES) return "too_large"
    return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || "document.pdf" }
  }
  if (type.startsWith("application/pdf") || type.startsWith("application/octet-stream")) {
    const buf = new Uint8Array(await request.arrayBuffer())
    if (buf.length > MAX_RECEIPT_BYTES) return "too_large"
    return { bytes: buf, name: (request.headers.get("x-file-name") ?? "document.pdf").slice(0, 120) }
  }
  return null
}

/** "✅ +$186.00 បានកត់ត្រា (DL MEAT SUPPLY · ABA DL USD)" … — to the owner, privately. */
async function ownerMessage(r: Recorded, payer: string): Promise<string> {
  const lines = [
    `✅ +${formatMoney(Number(r.amount), r.currency ?? "USD")} បានកត់ត្រា (${[r.workspace, r.wallet].filter(Boolean).join(" · ")})`,
    `🏢 ពីក្រុមហ៊ុន៖ ${payer}`,
    `📄 លេខយោង FT៖ ${r.reference ?? ""}`,
    ...(r.moved_to ? [`↪️ ប្រាក់ចូលគណនី៖ ${r.moved_to} (កត់ជាការផ្ទេរពីអាជីវកម្ម)`] : []),
  ]
  if (r.transaction_id) {
    const { data } = await botDb().rpc("bot_khqr_today", { p_key: botKey(), p_transaction_id: r.transaction_id })
    const d = data as { total: number; count: number; currency: "USD" | "KHR" } | null
    if (d && Number(d.count) > 0) lines.push(`📊 ថ្ងៃនេះ៖ ${formatMoney(Number(d.total), d.currency)} • ${d.count} ប្រតិបត្តិការ`)
  }
  return lines.join("\n")
}

export async function POST(request: Request) {
  const apiKey = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!KEY.test(apiKey)) return NextResponse.json({ ok: false, status: "unauthorized", error: "Missing or malformed API key (Authorization: Bearer lck_…)" }, { status: 401 })
  const keyHash = createHash("sha256").update(apiKey).digest("hex")

  const now = Date.now()
  const recent = (hits.get(keyHash) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= PER_MINUTE) return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 429 })
  hits.set(keyHash, [...recent, now])
  if (hits.size > 2_000) hits.delete(hits.keys().next().value!)

  const file = await fileOf(request)
  if (file === "too_large") return NextResponse.json({ ok: false, status: "too_large" }, { status: 413 })
  if (!file) return NextResponse.json({ ok: false, status: "invalid", error: "Send the PDF as multipart field \"file\" or as application/pdf" }, { status: 415 })

  const read = await readAbaReceipt(file.bytes, file.name)
  if (!read.ok) {
    if (read.reason === "unsafe") logEvent("warn", "khqr", "Unsafe PDF refused at the receipt ingest", { fold: true })
    const code = read.reason === "too_large" ? 413 : read.reason === "not_pdf" ? 415 : 422
    return NextResponse.json({ ok: false, status: read.reason }, { status: code })
  }
  const t = read.transfer

  const { data, error } = await botDb().rpc("bot_khqr_ingest_document", {
    p_key: botKey(),
    p_key_hash: keyHash,
    p_doc: { amount: t.amount, currency: t.currency, reference: t.reference, payer: t.payer, to_account: t.toAccount, posted_at: t.postedAt, remark: t.remark },
  })
  if (error) {
    logEvent("error", "khqr", `ABA receipt ingest failed: ${error.message}`, { fold: true })
    return NextResponse.json({ ok: false, status: "error" }, { status: 500 })
  }
  const r = data as Recorded
  if (r.status === "ok") {
    logEvent("info", "khqr", `ABA Business receipt recorded by API (${r.workspace})`, { fold: true })
    if (r.workspace_id) await notifyOwner({ workspaceId: r.workspace_id }, await ownerMessage(r, t.payer))
  } else if (r.status === "no_wallet") {
    // Nothing recorded: tell the owner which account it was paid into, so they can add its number to a wallet.
    if (r.workspace_id)
      await notifyOwner(
        { workspaceId: r.workspace_id },
        `⚠️ មិនទាន់កត់ត្រា៖ ${formatMoney(t.amount, t.currency)} ពី ${t.payer} (FT ${t.reference})\nបង់ចូលគណនី ${t.toAccount} ដែលមិនមាននៅលើកាបូបណាមួយ — សូមបញ្ចូលលេខគណនីនេះទៅកាបូបក្នុងកម្មវិធី រួចផ្ញើម្ដងទៀត។`,
      )
  }
  const http: Record<string, number> = { ok: 201, duplicate: 200, unauthorized: 401, plan_required: 402, not_writable: 403, invalid: 422, no_wallet: 422 }
  return NextResponse.json(
    {
      ok: r.status === "ok" || r.status === "duplicate",
      status: r.status === "ok" ? "recorded" : r.status,
      transaction_id: r.transaction_id ?? null,
      workspace: r.workspace ?? null,
      wallet: r.wallet ?? null,
      moved_to: r.moved_to ?? null,
      amount: t.amount,
      currency: t.currency,
      reference: t.reference,
      payer: t.payer,
      to_account: t.toAccount,
      posted_at: t.postedAt,
    },
    { status: http[r.status] ?? 500 },
  )
}
