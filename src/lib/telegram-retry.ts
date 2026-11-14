/**
 * When a Telegram call that failed on the network may be tried again (founder, 14/11/2026 — «sendMessage failed:
 * network» 4 times in 2 days, each message simply lost). Only where a retry can never post twice: an edit (the same
 * edit again changes nothing), or a send whose request never left — the name not resolved, the connection refused or
 * unreachable. A reset or a time-out may come after Telegram received the message: never retried for a send. Pure
 * (telegram-retry.test.ts).
 */
const NEVER_LEFT = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT)$/

export function telegramRetryable(method: string, code: string | undefined): boolean {
  if (/^edit/.test(method)) return true
  return NEVER_LEFT.test(code ?? "")
}

/** The error's code (undici puts it on `cause`), or its name — «network (ENOTFOUND)» in the log says why. */
export function networkCode(e: unknown): string {
  const err = e as { cause?: { code?: unknown }; code?: unknown; name?: unknown } | null
  const code = err?.cause?.code ?? err?.code ?? err?.name
  return typeof code === "string" ? code.slice(0, 40) : "unknown"
}

/** How long one Telegram call may take before it is given up (a hung call must never stall the scheduler's pass). */
export const TELEGRAM_TIMEOUT_MS = 30_000
export const TELEGRAM_RETRY_DELAY_MS = 1_500
