import type { KhqrConfig } from "./khqr-config"

/**
 * Bakong Open API (NBC). Endpoints used:
 *   POST /v1/check_transaction_by_md5   { md5 }   (Bearer token)
 *   POST /v1/generate_deeplink_by_qr    { qr, sourceInfo }
 * Note: Bakong has been reported to accept API calls only from Cambodian IP
 * addresses; if the server is hosted abroad, point BAKONG_API_URL at a relay
 * in Cambodia (the admin "Test Bakong" check shows the response).
 */

export type BakongTransaction = {
  hash: string
  fromAccountId: string | null
  toAccountId: string | null
  currency: "USD" | "KHR" | null
  amount: number
}

export type BakongCheck =
  | { kind: "paid"; tx: BakongTransaction }
  | { kind: "not_found" }
  | { kind: "error"; message: string }

/** Reads a check_transaction_by_md5 response body (pure; covered by tests). */
export function parseBakongCheck(httpStatus: number, body: unknown): BakongCheck {
  if (httpStatus === 401) return { kind: "error", message: "unauthorized (Bakong token invalid or expired)" }
  if (httpStatus === 403) return { kind: "error", message: "forbidden (token, or the server's IP/region is not allowed)" }
  if (httpStatus >= 500) return { kind: "error", message: `Bakong server error ${httpStatus}` }
  const b = (body ?? {}) as { responseCode?: number; errorCode?: number | null; responseMessage?: string; data?: Record<string, unknown> | null }
  if (b.responseCode === 0 && b.data && typeof b.data === "object") {
    const d = b.data
    const currency = String(d.currency ?? "").toUpperCase()
    const amount = Number(d.amount)
    const hash = String(d.hash ?? d.externalRef ?? "")
    if (!hash || !Number.isFinite(amount)) return { kind: "error", message: "unexpected Bakong response" }
    return {
      kind: "paid",
      tx: {
        hash,
        fromAccountId: d.fromAccountId ? String(d.fromAccountId) : null,
        toAccountId: d.toAccountId ? String(d.toAccountId) : null,
        currency: currency === "USD" || currency === "KHR" ? currency : null,
        amount,
      },
    }
  }
  // responseCode 1 / errorCode 1: no transaction for this md5 (yet).
  if (b.responseCode === 1 && (b.errorCode === 1 || b.errorCode == null)) return { kind: "not_found" }
  return { kind: "error", message: b.responseMessage || `Bakong error ${b.errorCode ?? httpStatus}` }
}

export async function checkTransactionByMd5(md5: string, cfg: KhqrConfig): Promise<BakongCheck> {
  if (!cfg.apiToken) return { kind: "error", message: "BAKONG_API_TOKEN missing" }
  try {
    const res = await fetch(`${cfg.apiUrl}/v1/check_transaction_by_md5`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiToken}` },
      body: JSON.stringify({ md5 }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    const body = await res.json().catch(() => null)
    return parseBakongCheck(res.status, body)
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "network error" }
  }
}

/** Short link that opens the payer's bank app with this KHQR (best effort). */
export async function generateDeeplink(qr: string, cfg: KhqrConfig, origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${cfg.apiUrl}/v1/generate_deeplink_by_qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr,
        sourceInfo: { appIconUrl: `${origin}/icons/icon-192.png`, appName: "LuySmart", appDeepLinkCallback: `${origin}/settings` },
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    })
    const body = (await res.json().catch(() => null)) as { responseCode?: number; data?: { shortLink?: string } } | null
    const link = body?.responseCode === 0 ? body.data?.shortLink : undefined
    return link && /^https:\/\//.test(link) ? link : null
  } catch {
    return null
  }
}
