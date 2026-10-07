import { createHash } from "crypto"
import { NextResponse } from "next/server"

import { parseMerchantPayment } from "@/lib/bot/merchant-khqr"
import { formatMoney } from "@/lib/money"
import { logEvent } from "@/lib/server/events"
import { transferText, type TransferResult } from "@/lib/server/biz-group-bot"
import { announcePoolPayment } from "@/lib/server/pool-flow"
import { botDb, botKey, sendText, tr } from "@/lib/server/telegram-bot"

/**
 * KHQR ingest API — a merchant's own tool (e.g. AUTOBOK) pushes each bank
 * payment notification it reads, and LuyChlat records it as Sales income in
 * the business workspace the key belongs to (the bank's wallet in that
 * currency), once per bank reference.
 *
 *   POST /api/khqr/ingest
 *   Authorization: Bearer lck_<64 hex>        (Settings › Telegram › Business KHQR group)
 *   Content-Type: application/json
 *
 * Body — either the bank's message as is:
 *   { "text": "Received 1.00 USD from Sreyleak Tim,ABA Bank by KHQR,on 06-Oct-2026 10:22PM, at … (Hash. a1a576d9)." }
 * or the fields:
 *   { "bank": "ACLEDA" | "ABA", "amount": 1.00, "currency": "USD" | "KHR", "ref": "a1a576d9",
 *     "payer": "Sreyleak Tim", "paid_at": "2026-10-06T22:22:00+07:00" }
 * (aliases: hash / transactionId → ref, sender → payer, timestamp → paid_at — ISO 8601 with
 * its offset: "2026-10-06T22:22:00+07:00" or the true UTC "2026-10-06T15:22:00Z"). Other
 * fields (e.g. chatId) are ignored: the key decides the business. Optional:
 * "notify_group": true posts "✅ +$1.00 បានកត់ត្រា …" in the Telegram group(s) linked to the business.
 *
 * Answers: 201 recorded · 200 duplicate (already recorded — safe to retry) · 401 bad key ·
 * 402 plan required · 403 not allowed · 422 not a payment / no wallet · 429 too many.
 */
export const runtime = "nodejs"

type LinkedGroup = { chat_id: number | string; title: string | null }

const BANK_TITLES: Record<string, RegExp> = { ACLEDA: /acleda|អេស៊ីលីដា/i, ABA: /(^|[^a-z])aba([^a-z]|$)/i }

/**
 * Where a payment is announced: the groups whose title names its bank ("DL ABA KHQR");
 * if none does, the groups that name no bank — never another bank's group.
 */
function groupsForBank(groups: LinkedGroup[], bank: string): LinkedGroup[] {
  const banksIn = (g: LinkedGroup) => Object.keys(BANK_TITLES).filter((b) => BANK_TITLES[b].test(g.title ?? ""))
  const own = groups.filter((g) => banksIn(g).includes(bank.toUpperCase()))
  return own.length ? own : groups.filter((g) => banksIn(g).length === 0)
}

// lck_… a business's key (Sales income); lcp_… a shared pool's key (asks its group which share paid).
const KEY = /^lc[kp]_[a-f0-9]{64}$/
const hits = new Map<string, number[]>()
const PER_MINUTE = 120

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "")

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? ""
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim()
  if (!KEY.test(apiKey)) return NextResponse.json({ ok: false, status: "unauthorized", error: "Missing or malformed API key (Authorization: Bearer lck_…)" }, { status: 401 })
  const keyHash = createHash("sha256").update(apiKey).digest("hex")

  const now = Date.now()
  const recent = (hits.get(keyHash) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= PER_MINUTE) return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 429 })
  hits.set(keyHash, [...recent, now])
  if (hits.size > 2_000) hits.delete(hits.keys().next().value!)

  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 8_000) return NextResponse.json({ ok: false, status: "invalid", error: "Body too large" }, { status: 413 })
    body = JSON.parse(raw) as Record<string, unknown>
    if (!body || typeof body !== "object") throw new Error("not an object")
  } catch {
    return NextResponse.json({ ok: false, status: "invalid", error: "Body must be JSON" }, { status: 400 })
  }

  // The bank's message as is, or the fields.
  const text = str(body.text, 2_000)
  const parsed = text ? parseMerchantPayment(text) : null
  if (text && !parsed) return NextResponse.json({ ok: false, status: "invalid", error: "Not an ACLEDA / ABA PayWay KHQR payment message" }, { status: 422 })
  const pay = parsed
    ? {
        bank: parsed.bank,
        amount: parsed.amount,
        currency: parsed.currency,
        ref: parsed.ref,
        payer: parsed.payer,
        posted_at: parsed.postedAt,
        payer_account: parsed.payerAccount,
        merchant: parsed.merchant,
      }
    : {
        bank: str(body.bank, 10).toUpperCase(),
        amount: typeof body.amount === "number" ? body.amount : Number(str(body.amount, 30).replace(/,/g, "")),
        currency: str(body.currency, 5).toUpperCase(),
        ref: str(body.ref ?? body.hash ?? body.transactionId ?? body.transaction_id, 64),
        payer: str(body.payer ?? body.sender, 80) || null,
        posted_at: str(body.paid_at ?? body.timestamp, 40) || null,
        // Optional: the payer's account ending and the receiver ("at SOU CHENDA") — an own transfer is recorded as one.
        payer_account: str(body.payer_account, 30) || null,
        merchant: str(body.merchant ?? body.receiver, 80) || null,
      }

  if (apiKey.startsWith("lcp_")) {
    // A shared pool: the payment waits for the treasurer to tap which share it is (in the pool's group).
    const { data: opened, error: poolError } = await botDb().rpc("bot_pool_khqr_ingest", { p_key: botKey(), p_key_hash: keyHash, p_pay: { ...pay, ref: pay.ref || null } })
    if (poolError) {
      logEvent("error", "pool", `Pool KHQR ingest failed: ${poolError.message}`, { fold: true })
      return NextResponse.json({ ok: false, status: "error" }, { status: 500 })
    }
    const o = opened as { status: string; id?: string; chat_id?: number | null }
    if (o.status === "ok") await announcePoolPayment(o).catch(() => null)
    const code: Record<string, number> = { ok: 201, duplicate: 200, unauthorized: 401, no_pool: 410, invalid: 422 }
    return NextResponse.json({ ok: o.status === "ok" || o.status === "duplicate", status: o.status, pending_id: o.id ?? null }, { status: code[o.status] ?? 500 })
  }

  const { data, error } = await botDb().rpc("bot_khqr_ingest", { p_key: botKey(), p_key_hash: keyHash, p_pay: pay })
  if (error) {
    logEvent("error", "khqr", `KHQR ingest failed: ${error.message}`, { fold: true })
    return NextResponse.json({ ok: false, status: "error" }, { status: 500 })
  }
  const r = data as {
    status: string
    transaction_id?: string
    workspace_id?: string
    workspace?: string
    wallet?: string
    amount?: number
    currency?: "USD" | "KHR"
    bank?: string
    posted_at?: string
    from_wallet?: string
    from_bank?: string | null
    suffix?: string
  }
  const http: Record<string, number> = { ok: 201, transfer: 201, duplicate: 200, unauthorized: 401, plan_required: 402, not_writable: 403, invalid: 422, no_wallet: 422 }
  const status = http[r.status] ?? 500
  const message =
    r.status === "ok" && r.amount !== undefined && r.currency
      ? tr("km", "biz.recorded", { amount: `+${formatMoney(Number(r.amount), r.currency)}`, workspace: r.workspace ?? "", bank: r.bank ?? pay.bank })
      : r.status === "transfer" && r.amount !== undefined && r.currency
        ? transferText(r as TransferResult)
        : null

  if (r.status === "ok" || r.status === "transfer") {
    logEvent("info", "khqr", `KHQR ${r.bank} ${r.status === "transfer" ? "own transfer" : "payment"} pushed by API (${r.workspace})`, { fold: true })
    // Optional: say so in the business's linked Telegram group for this bank.
    if (body.notify_group === true && message && r.workspace_id) {
      const { data: groups } = await botDb().rpc("bot_biz_groups_of", { p_key: botKey(), p_workspace_id: r.workspace_id })
      for (const g of groupsForBank((groups as LinkedGroup[] | null) ?? [], r.bank ?? pay.bank)) await sendText(Number(g.chat_id), message).catch(() => null)
    }
  }

  return NextResponse.json(
    {
      ok: r.status === "ok" || r.status === "duplicate",
      status: r.status === "ok" ? "recorded" : r.status,
      transaction_id: r.transaction_id ?? null,
      workspace: r.workspace ?? null,
      wallet: r.wallet ?? null,
      amount: r.amount ?? null,
      currency: r.currency ?? null,
      bank: r.bank ?? pay.bank ?? null,
      ref: pay.ref ? String(pay.ref).toLowerCase() : null,
      posted_at: r.posted_at ?? null,
      message,
    },
    { status },
  )
}
