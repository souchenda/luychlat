/**
 * KHQR checkout settings, from server-only environment variables (never
 * NEXT_PUBLIC_*; nothing here reaches the browser):
 *
 *   KHQR_MODE              off (default) | sandbox | production
 *   BAKONG_ACCOUNT_ID      e.g. luysmart@aclb (the account that receives the money)
 *   BAKONG_MERCHANT_NAME   shown in the bank app, max 25 (default "LuySmart")
 *   BAKONG_MERCHANT_CITY   max 15 (default "Phnom Penh")
 *   BAKONG_MERCHANT_ID / BAKONG_ACQUIRING_BANK   only for a merchant account (KHQR tag 30)
 *   BAKONG_API_TOKEN       Bakong Open API token (renew before it expires)
 *   BAKONG_API_URL         default https://api-bakong.nbc.gov.kh (or a relay in Cambodia)
 *   KHQR_EXPIRY_MINUTES    10–15 (default 15)
 *   SUPABASE_SECRET_KEY    service-role key: confirms payments and extends PRO
 *
 * Sandbox: no Bakong calls; an admin can simulate a successful payment.
 */
export type KhqrMode = "off" | "sandbox" | "production"

export type KhqrConfig = {
  mode: KhqrMode
  accountId: string
  merchantName: string
  merchantCity: string
  merchant?: { merchantId: string; acquiringBank: string }
  apiUrl: string
  apiToken: string | null
  expiryMinutes: number
  /** Why the configured mode can't run (empty when it can). */
  problems: string[]
}

const SANDBOX_ACCOUNT = "luysmart_sandbox@devb"

export function khqrConfig(): KhqrConfig {
  const env = process.env
  const requested = (env.KHQR_MODE ?? "off").toLowerCase()
  const mode: KhqrMode = requested === "production" || requested === "sandbox" ? requested : "off"
  const merchantId = env.BAKONG_MERCHANT_ID?.trim()
  const acquiringBank = env.BAKONG_ACQUIRING_BANK?.trim()
  const accountId = env.BAKONG_ACCOUNT_ID?.trim() || (mode === "sandbox" ? SANDBOX_ACCOUNT : "")
  const expiry = Number(env.KHQR_EXPIRY_MINUTES ?? 15)

  const problems: string[] = []
  if (mode !== "off") {
    if (!env.SUPABASE_SECRET_KEY) problems.push("SUPABASE_SECRET_KEY is missing")
    if (!env.NEXT_PUBLIC_SUPABASE_URL) problems.push("NEXT_PUBLIC_SUPABASE_URL is missing")
  }
  if (mode === "production") {
    if (!env.BAKONG_ACCOUNT_ID) problems.push("BAKONG_ACCOUNT_ID is missing")
    if (!env.BAKONG_API_TOKEN) problems.push("BAKONG_API_TOKEN is missing")
  }

  return {
    mode: problems.length ? "off" : mode,
    accountId,
    merchantName: (env.BAKONG_MERCHANT_NAME?.trim() || "LuySmart").slice(0, 25),
    merchantCity: (env.BAKONG_MERCHANT_CITY?.trim() || "Phnom Penh").slice(0, 15),
    merchant: merchantId && acquiringBank ? { merchantId, acquiringBank } : undefined,
    apiUrl: (env.BAKONG_API_URL?.trim() || "https://api-bakong.nbc.gov.kh").replace(/\/+$/, ""),
    apiToken: env.BAKONG_API_TOKEN?.trim() || null,
    expiryMinutes: Number.isFinite(expiry) ? Math.min(15, Math.max(10, expiry)) : 15,
    problems,
  }
}
