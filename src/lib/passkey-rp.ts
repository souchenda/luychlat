/**
 * Passkeys: which web origins may run a WebAuthn ceremony, and the relying-party id each gets (the
 * hostname — a passkey made on app.luychlat.com works only there, as the standard requires). Pure
 * (passkey-rp.test.ts).
 */
export const PASSKEY_RP_NAME = "App Luy Chlat"

/** The app's own origins; PASSKEY_ORIGINS (comma-separated) may add more; localhost only outside production. */
export function allowedOrigins(env: { PASSKEY_ORIGINS?: string; NODE_ENV?: string } = process.env): string[] {
  const extra = (env.PASSKEY_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https:\/\/[a-z0-9.-]+$/i.test(s))
  const dev = env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]
  return ["https://app.luychlat.com", ...extra, ...dev]
}

/** The request's origin and its relying-party id, or null when the origin isn't one of ours. */
export function relyingParty(origin: string | null | undefined, allowed: string[]): { origin: string; rpID: string } | null {
  if (!origin || !allowed.includes(origin)) return null
  return { origin, rpID: new URL(origin).hostname }
}

/** A short label for the device that made the passkey, from its user agent. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ""
  if (/iPhone/.test(ua)) return "iPhone"
  if (/iPad/.test(ua)) return "iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Macintosh/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows"
  return "ឧបករណ៍"
}
