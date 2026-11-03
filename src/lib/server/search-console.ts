// Server only: last week's Google Search figures for the Sunday report (founder, 3/11/2026 — lib/search-console.ts).
import { existsSync, readFileSync } from "node:fs"

import { GSC_KEY_FILE, GSC_SITE, GSC_TOKEN_URL, parseServiceKey, searchWeek, serviceAssertion, type SearchWeek } from "@/lib/search-console"

import { logEvent } from "./events"

const QUERY_URL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`

type Row = { keys?: string[]; clicks?: number; impressions?: number }

/** Null until the founder has put the key on the server; "error" when Google could not be read (logged why). */
export async function searchConsoleWeek(day: string): Promise<SearchWeek | "error" | null> {
  if (!existsSync(GSC_KEY_FILE)) return null
  try {
    const key = parseServiceKey(readFileSync(GSC_KEY_FILE, "utf8"))
    if (!key) throw new Error("the key file is not a service-account JSON key")
    const tokenRes = await fetch(GSC_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAssertion(key, Math.floor(Date.now() / 1000)) }),
      signal: AbortSignal.timeout(15_000),
    })
    const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string }
    if (!token.access_token) throw new Error(`token: HTTP ${tokenRes.status} ${token.error_description ?? token.error ?? ""}`.trim())
    const { start, end } = searchWeek(day)
    const query = async (body: Record<string, unknown>) => {
      const res = await fetch(QUERY_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, ...body }),
        signal: AbortSignal.timeout(15_000),
      })
      const json = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: { message?: string } }
      if (!res.ok) throw new Error(`query: HTTP ${res.status} ${json.error?.message ?? ""}`.trim())
      return json.rows ?? []
    }
    const [total, topRows] = await Promise.all([query({}), query({ dimensions: ["query"], rowLimit: 1 })])
    return { clicks: Number(total[0]?.clicks ?? 0), impressions: Number(total[0]?.impressions ?? 0), top: topRows[0]?.keys?.[0] ?? null }
  } catch (e) {
    logEvent("warn", "search-console", `Search Console not read: ${(e as Error).message}`, { fold: true })
    return "error"
  }
}
