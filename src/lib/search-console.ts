/**
 * Google Search Console in the founder's Sunday report (founder, 3/11/2026): one line — how often luychlat.com came up
 * in Google and was clicked last week, and the top search. Totals only, never a person. Pure (search-console.test.ts);
 * the fetch is lib/server/search-console.ts.
 */
import { createSign } from "node:crypto"

/** The Domain property verified through Cloudflare (keep its TXT google-site-verification record). */
export const GSC_SITE = "sc-domain:luychlat.com"
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
export const GSC_TOKEN_URL = "https://oauth2.googleapis.com/token"
/** The service account's JSON key, put on the server by the founder (deploy/run is mounted read-only; never in git). */
export const GSC_KEY_FILE = "/run/luysmart/gsc-key.json"

export type ServiceKey = { client_email: string; private_key: string }

/** A key file's two fields we need, or null when it is not a service-account key. */
export function parseServiceKey(raw: string): ServiceKey | null {
  try {
    const k = JSON.parse(raw) as Partial<ServiceKey>
    if (typeof k.client_email !== "string" || typeof k.private_key !== "string" || !k.private_key.includes("PRIVATE KEY")) return null
    return { client_email: k.client_email, private_key: k.private_key }
  } catch {
    return null
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url")

/** The signed JWT a service account trades for an access token (RS256, one hour). */
export function serviceAssertion(key: ServiceKey, nowSec: number): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: GSC_SCOPE, aud: GSC_TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }))
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key)
  return `${head}.${claims}.${b64url(sig)}`
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** The report's day is a Sunday (Cambodia date). */
export const isSunday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0

/** Google's figures lag 2–3 days: the last 7 complete days, ending 3 days before the report. */
export const searchWeek = (day: string) => ({ start: shift(day, -9), end: shift(day, -3) })

export type SearchWeek = { clicks: number; impressions: number; top: string | null }

/** The one report line: the week, clicks, impressions, the top search — or that it could not be read (never silent). */
export function searchConsoleLine(day: string, r: SearchWeek | "error"): string {
  const { start, end } = searchWeek(day)
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const label = `Google ${dm(start)}–${dm(end)}`
  if (r === "error") return `${label}: could not be read — the Search Console key needs a look`
  if (!r.impressions) return `${label}: not in search results yet`
  const top = r.top ? ` · top search «${r.top.replace(/\s+/g, " ").trim().slice(0, 40)}»` : ""
  return `${label}: ${r.clicks} click${r.clicks === 1 ? "" : "s"} · ${r.impressions} impression${r.impressions === 1 ? "" : "s"}${top}`
}
