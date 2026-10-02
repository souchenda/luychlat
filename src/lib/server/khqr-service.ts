import { createHash, randomBytes } from "node:crypto"

import { buildKhqr, type KhqrCurrency } from "@/lib/khqr/khqr"
import { createSupabaseServerClient } from "@/lib/supabase/server"

import { checkTransactionByMd5, generateDeeplink } from "./bakong"
import type { KhqrConfig } from "./khqr-config"
import { supabaseAdmin } from "./supabase-admin"

/** What the checkout screen gets back (no secrets). */
export type KhqrView = {
  id: string
  status: "PENDING" | "PAID" | "EXPIRED" | "REJECTED"
  qr: string | null
  amount: number
  currency: KhqrCurrency
  plan_code: string
  bill_number: string | null
  expires_at: string | null
  sandbox: boolean
  merchant_name: string
  deeplink: string | null
  /** New end of PRO once paid. */
  period_end: string | null
}

type PaymentRow = {
  id: string
  user_id: string
  status: KhqrView["status"]
  khqr: string | null
  amount: number | string
  currency: KhqrCurrency
  plan_code: string
  bill_number: string | null
  expires_at: string | null
  sandbox: boolean
  bakong_md5: string | null
  method: string
  created_at: string
}

export const toView = (p: PaymentRow, cfg: KhqrConfig, extra: Partial<KhqrView> = {}): KhqrView => ({
  id: p.id,
  status: p.status,
  qr: p.status === "PENDING" ? p.khqr : null,
  amount: Number(p.amount),
  currency: p.currency,
  plan_code: p.plan_code,
  bill_number: p.bill_number,
  expires_at: p.expires_at,
  sandbox: p.sandbox,
  merchant_name: cfg.merchantName,
  deeplink: null,
  period_end: null,
  ...extra,
})

/** The signed-in user (verified with Supabase Auth), or null. */
export async function currentUser() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? { user: data.user, supabase } : null
}

const billNumber = () => `LS${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`

export async function createKhqrPayment(userId: string, planCode: string, currency: KhqrCurrency, cfg: KhqrConfig, origin: string) {
  const admin = supabaseAdmin()
  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("code, price_usd, price_khr, active, tier")
    .eq("code", planCode)
    .maybeSingle()
  if (planError || !plan || !plan.active || plan.tier !== "PRO") throw new Error("unknown_plan")

  const createdAt = Date.now()
  const expiresAt = createdAt + cfg.expiryMinutes * 60_000
  const bill = billNumber()
  const qr = buildKhqr({
    accountId: cfg.accountId,
    merchantName: cfg.merchantName,
    merchantCity: cfg.merchantCity,
    merchant: cfg.merchant,
    currency,
    amount: Number(currency === "USD" ? plan.price_usd : plan.price_khr),
    billNumber: bill,
    storeLabel: "LuySmart PRO",
    createdAt,
    expiresAt,
  })
  const md5 = createHash("md5").update(qr, "utf8").digest("hex")

  const { data, error } = await admin.rpc("khqr_create_payment", {
    p_user_id: userId,
    p_plan_code: planCode,
    p_currency: currency,
    p_bill_number: bill,
    p_md5: md5,
    p_qr: qr,
    p_expires_at: new Date(expiresAt).toISOString(),
    p_sandbox: cfg.mode === "sandbox",
  })
  if (error) throw new Error(/too_many_qr/.test(error.message) ? "too_many_qr" : "create_failed")
  const deeplink = cfg.mode === "production" ? await generateDeeplink(qr, cfg, origin) : null
  return toView(data as PaymentRow, cfg, { deeplink })
}

export async function loadPayment(paymentId: string, userId: string): Promise<PaymentRow | null> {
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("id, user_id, status, khqr, amount, currency, plan_code, bill_number, expires_at, sandbox, bakong_md5, method, created_at")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .eq("method", "KHQR")
    .maybeSingle()
  return (data as PaymentRow | null) ?? null
}

export async function confirmPayment(p: PaymentRow, hash: string, amount: number, currency: KhqrCurrency, payer: string | null) {
  const { data, error } = await supabaseAdmin().rpc("khqr_confirm_payment", {
    p_payment_id: p.id,
    p_hash: hash,
    p_amount: amount,
    p_currency: currency,
    p_payer_account: payer,
    p_note: null,
  })
  if (error) throw new Error(error.message)
  return data as { status: "PAID"; period_end: string | null }
}

/** One Bakong call per payment every few seconds, however often the screen polls. */
const lastCheck = new Map<string, number>()
const CHECK_EVERY_MS = 3000
/** A QR paid in its last seconds can show up at Bakong a bit later. */
const LATE_PAYMENT_WINDOW_MS = 24 * 60 * 60_000

export async function refreshStatus(p: PaymentRow, cfg: KhqrConfig): Promise<KhqrView> {
  if (p.status === "PAID") {
    const { data } = await supabaseAdmin().from("subscriptions").select("current_period_end").eq("user_id", p.user_id).maybeSingle()
    return toView(p, cfg, { period_end: data?.current_period_end ?? null })
  }
  if (p.status !== "PENDING" && p.status !== "EXPIRED") return toView(p, cfg)

  const expired = p.expires_at ? Date.parse(p.expires_at) <= Date.now() : false
  const tooLate = p.expires_at ? Date.now() - Date.parse(p.expires_at) > LATE_PAYMENT_WINDOW_MS : false

  // Production: ask Bakong (sandbox payments only complete through "simulate").
  if (cfg.mode === "production" && !p.sandbox && p.bakong_md5 && !tooLate) {
    const last = lastCheck.get(p.id) ?? 0
    if (Date.now() - last >= CHECK_EVERY_MS) {
      lastCheck.set(p.id, Date.now())
      if (lastCheck.size > 5000) lastCheck.clear()
      const result = await checkTransactionByMd5(p.bakong_md5, cfg)
      if (result.kind === "paid") {
        const tx = result.tx
        const toUs = !tx.toAccountId || tx.toAccountId.toLowerCase() === cfg.accountId.toLowerCase()
        if (toUs && tx.currency === p.currency && Math.abs(tx.amount - Number(p.amount)) < 0.005) {
          const confirmed = await confirmPayment(p, tx.hash, Number(p.amount), p.currency, tx.fromAccountId)
          return toView({ ...p, status: "PAID" }, cfg, { period_end: confirmed.period_end })
        }
        console.warn(`[khqr] payment ${p.id}: Bakong transaction doesn't match (to ${tx.toAccountId}, ${tx.amount} ${tx.currency})`)
      } else if (result.kind === "error") {
        console.warn(`[khqr] Bakong check failed: ${result.message}`)
      }
    }
  }

  if (expired && p.status === "PENDING") {
    const { data } = await supabaseAdmin().rpc("khqr_expire_payment", { p_payment_id: p.id })
    return toView((data as PaymentRow) ?? { ...p, status: "EXPIRED" }, cfg)
  }
  return toView(p, cfg)
}
