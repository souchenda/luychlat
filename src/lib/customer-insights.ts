/**
 * «អតិថិជនទៀងទាត់» — KHQR regular-customer insights (founder, 4/11/2026): what public.khqr_customer_insights returns, read
 * safely (Postgres numerics arrive as strings), and the busiest hours. The owner of a Business workspace only — the database
 * refuses anyone else. Pure (customer-insights.test.ts); the page is app/(app)/business/customers.
 */
export type Regular = { payer: string; visits: number; khr: number; usd: number; last_at: string }
export type Missing = { payer: string; visits: number; last_at: string; days_since: number }
export type HourSales = { hour: number; sales: number }
export type Insights = { days: number; sales: number; payers: number; regulars: Regular[]; missing: Missing[]; hours: HourSales[] }

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

export function parseInsights(raw: unknown): Insights {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    days: num(r.days) || 90,
    sales: num(r.sales),
    payers: num(r.payers),
    regulars: list(r.regulars).map((x) => ({ payer: String(x.payer ?? ""), visits: num(x.visits), khr: num(x.khr), usd: num(x.usd), last_at: String(x.last_at ?? "") })),
    missing: list(r.missing).map((x) => ({ payer: String(x.payer ?? ""), visits: num(x.visits), last_at: String(x.last_at ?? ""), days_since: num(x.days_since) })),
    hours: list(r.hours)
      .map((x) => ({ hour: num(x.hour), sales: num(x.sales) }))
      .filter((h) => h.hour >= 0 && h.hour <= 23 && h.sales > 0),
  }
}

/** The busiest hours, most sales first (an earlier hour first on a tie). */
export function busiestHours(hours: HourSales[], n = 3): HourSales[] {
  return [...hours].sort((a, b) => b.sales - a.sales || a.hour - b.hour).slice(0, n)
}

const pad = (h: number) => String(h).padStart(2, "0")
/** «11:00–12:00» (0-9 digits — CLAUDE.md §7). */
export const hourRange = (hour: number) => `${pad(hour)}:00–${pad((hour + 1) % 24)}:00`
