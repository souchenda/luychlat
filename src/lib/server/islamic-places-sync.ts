// Server only: the Islamic places finder's data from OpenStreetMap (founder, 19/10/2026 — pre-loaded, like the ATM
// finder). Seeded once on the first tick after the deploy, then refreshed every Sunday from 03:30 (Cambodia time).
import { ISLAMIC_PLACES_QUERY, toPlaceRows } from "@/lib/islamic/places-osm"
import { TOWNS } from "@/lib/kh-towns"
import type { OsmElement } from "@/lib/atm"

import { logEvent } from "./events"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey } from "./telegram-bot"

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

async function fetchOverpass(): Promise<OsmElement[] | null> {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "LuyChlat/1.0 (https://app.luychlat.com)" },
        body: new URLSearchParams({ data: ISLAMIC_PLACES_QUERY }),
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
export async function syncIslamicPlaces(): Promise<string> {
  const elements = await fetchOverpass()
  if (!elements) return "Overpass unreachable"
  const rows = toPlaceRows(elements, TOWNS)
  const { data, error } = await botDb().rpc("bot_islamic_places_sync", { p_key: botKey(), p_rows: rows })
  if (error) return `store failed: ${error.message}`
  const r = data as { status: string; rows: number; removed?: number }
  return r.status === "ok" ? `${r.rows} places, ${r.removed ?? 0} removed` : `skipped (${r.rows} places)`
}

const run = (why: string) =>
  void syncIslamicPlaces()
    .then((result) => logEvent(/failed|unreachable|skipped/.test(result) ? "error" : "info", "islamic-places", `Islamic places ${why}: ${result}`))
    .catch((e) => logEvent("error", "islamic-places", `Islamic places ${why} failed: ${(e as Error).message}`))

/** Called every minute by the dispatcher: the first seed once ever, then every Sunday from 03:30, in the background. */
export async function islamicPlacesSyncTick() {
  // The first seed: once (a fixed claim day), right after the deploy that brings the finder. «-v2»: the first try
  // (19/10/2026 12:27) was refused by the database (a missing grant, fixed in 20270181) and used up its claim.
  const { data: seed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "islamic-places-seed-v2", p_day: "2026-10-19" })
  if (seed === true) return run("seed")
  const now = phnomPenhToday()
  if (new Date(`${now.day}T12:00:00Z`).getUTCDay() !== 0 || now.hour * 60 + now.minute < 3 * 60 + 30) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "islamic-places-sync", p_day: now.day })
  if (claimed === true) run("refresh")
}
