// Server only: the ATM finder's data — the weekly refresh from OpenStreetMap (Sunday from 03:00, Cambodia
// time) and the rows the bot searches, cached for an hour (a few hundred, so distances are computed here).
import { toAtmRow, type BankAtm, type OsmElement } from "@/lib/atm"
import { TOWNS } from "@/lib/kh-towns"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey } from "./telegram-bot"

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
const QUERY = `[out:json][timeout:90];
area["ISO3166-1"="KH"][admin_level=2]->.kh;
(node["amenity"="atm"](area.kh); node["amenity"="bank"](area.kh); way["amenity"="bank"](area.kh););
out center tags;`

let cache: { at: number; rows: BankAtm[] } | null = null

/** A newly approved ATM shows at once. */
export const clearAtmCache = () => {
  cache = null
}

/** All ATMs and branches (cached for an hour; the last good copy when the database can't be read). */
export async function loadAtms(): Promise<BankAtm[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.rows
  const { data, error } = await botDb().from("bank_atms").select("osm_ref, bank_code, type, name_kh, name_en, address, province, province_km, latitude, longitude, currencies, is_24h").limit(5000)
  if (error || !data) return cache?.rows ?? []
  cache = { at: Date.now(), rows: data as BankAtm[] }
  return cache.rows
}

async function fetchOverpass(): Promise<OsmElement[] | null> {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LuyChlat/1.0 (https://luy.ibmserp.com)" },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(120_000),
      })
      if (res.ok) return ((await res.json()) as { elements?: OsmElement[] }).elements ?? null
    } catch {
      // the next mirror
    }
  }
  return null
}

/** Fetch, convert and store; a failed or short answer leaves the table as it is. */
export async function syncAtms(): Promise<string> {
  const elements = await fetchOverpass()
  if (!elements) return "Overpass unreachable"
  const rows = elements.map((e) => toAtmRow(e, TOWNS)).filter((r) => r !== null)
  const { data, error } = await botDb().rpc("bot_atm_sync", { p_key: botKey(), p_rows: rows })
  if (error) return `store failed: ${error.message}`
  cache = null
  const r = data as { status: string; rows: number; removed?: number }
  return r.status === "ok" ? `${r.rows} rows, ${r.removed ?? 0} removed` : `skipped (${r.rows} rows)`
}

/** Called every minute by the dispatcher: once on Sunday from 03:00, in the background. */
export async function atmSyncTick() {
  const now = phnomPenhToday()
  if (new Date(`${now.day}T12:00:00Z`).getUTCDay() !== 0 || now.hour < 3) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "atm-sync", p_day: now.day })
  if (claimed !== true) return
  // Overpass can take a minute or two: the other jobs don't wait for it.
  void syncAtms()
    .then((result) => logEvent(/failed|unreachable|skipped/.test(result) ? "error" : "info", "atm-sync", `ATM refresh: ${result}`))
    .catch((e) => logEvent("error", "atm-sync", `ATM refresh failed: ${(e as Error).message}`))
}
