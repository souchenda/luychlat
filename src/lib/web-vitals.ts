/**
 * The app's real speed on members' phones (founder, 14/11/2026 — «make it faster», and nothing measured it: the server
 * keeps no timings). Each page view reports Google's Web Vitals — LCP (the main content shown), INP (a tap answered),
 * CLS (the layout jumping), FCP (first paint), TTFB (the server's answer) — with only the screen's route (ids removed)
 * and the kind of device: no person, no amount, no text. Admin › Super shows the 75th percentile per screen (what 3 in
 * 4 members get), so the slowest screen is fixed first, before the 15/12 freeze. Pure (web-vitals.test.ts).
 */

export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const
export type VitalName = (typeof VITALS)[number]
export type Device = "apk" | "mobile" | "desktop"
export type VitalReport = { metric: VitalName; value: number; route: string; device: Device }

/** Google's thresholds (web.dev): good up to the first, poor beyond the second. CLS has no unit; the rest are ms. */
export const THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
}

export const ratingOf = (metric: VitalName, value: number): "good" | "needs-improvement" | "poor" =>
  value <= THRESHOLDS[metric][0] ? "good" : value <= THRESHOLDS[metric][1] ? "needs-improvement" : "poor"

/** The screen, never the record: «/debts/0b8c…» → «/debts/:id», «/invoice/123» → «/invoice/:n»; no query, at most 80 chars. */
export function normalizeRoute(path: string): string {
  const clean = (path.split(/[?#]/)[0] || "/")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/{2,}/g, "/")
  return (clean.length > 1 ? clean.replace(/\/$/, "") : clean).slice(0, 80)
}

/** The Android app (its User-Agent token), a phone browser, or a computer. */
export const deviceOf = (ua: string): Device => (/LuyChlatApp\//.test(ua) ? "apk" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop")

/** A report the server accepts — anything else (an unknown metric, an impossible value, a non-route) is dropped. */
export function parseVital(raw: unknown): VitalReport | null {
  const r = raw as Partial<Record<keyof VitalReport, unknown>> | null
  const metric = VITALS.find((m) => m === r?.metric)
  const value = typeof r?.value === "number" ? r.value : NaN
  const device = r?.device === "apk" || r?.device === "mobile" || r?.device === "desktop" ? r.device : null
  const route = typeof r?.route === "string" && r.route.startsWith("/") ? normalizeRoute(r.route) : null
  if (!metric || !device || !route || !Number.isFinite(value) || value < 0) return null
  if (metric === "CLS" ? value > 10 : value > 120_000) return null
  return { metric, value: metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value), route, device }
}

/** «2.4 s», «180 ms», «0.05» — how a value reads on the card. */
export const formatVital = (metric: VitalName, value: number) =>
  metric === "CLS" ? value.toFixed(2) : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
