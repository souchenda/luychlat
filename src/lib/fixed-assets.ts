/**
 * Fixed asset register — straight-line depreciation by completed months
 * (CIFRS for SMEs, section 17). Pure and dependency-free (unit-tested in
 * fixed-assets.test.ts); used by personal assets, the business register,
 * the P&L's non-cash depreciation line and the business value.
 *
 *   depreciable  = cost − salvage
 *   monthly      = depreciable / useful life (months)
 *   accumulated  = min(depreciable, monthly × completed months)   (0 before the purchase date)
 *   net book value = cost − accumulated                            (never below salvage)
 *
 * A disposed asset stops depreciating on its disposal date and leaves the totals.
 */

export type Currency = "USD" | "KHR"

/** The standard business classification, with the recommended useful life (months). */
export type FixedAssetCategory = "BUILDINGS_LEASEHOLD" | "MACHINERY_EQUIPMENT" | "VEHICLES" | "FURNITURE_FIXTURES" | "IT_ELECTRONICS" | "OTHER"
export const FIXED_ASSET_CATEGORIES: FixedAssetCategory[] = [
  "BUILDINGS_LEASEHOLD",
  "MACHINERY_EQUIPMENT",
  "VEHICLES",
  "FURNITURE_FIXTURES",
  "IT_ELECTRONICS",
  "OTHER",
]
export const RECOMMENDED_LIFE: Record<FixedAssetCategory, { min: number; max: number; default: number }> = {
  BUILDINGS_LEASEHOLD: { min: 60, max: 120, default: 120 },
  MACHINERY_EQUIPMENT: { min: 36, max: 84, default: 60 },
  VEHICLES: { min: 48, max: 96, default: 60 },
  FURNITURE_FIXTURES: { min: 36, max: 60, default: 48 },
  IT_ELECTRONICS: { min: 24, max: 36, default: 36 },
  OTHER: { min: 12, max: 120, default: 60 },
}
export const isFixedAssetCategory = (v: string): v is FixedAssetCategory => (FIXED_ASSET_CATEGORIES as string[]).includes(v)

/** ACTIVE / DISPOSED are stored; FULLY_DEPRECIATED is derived (an active asset past its useful life). */
export type FixedAssetStatus = "ACTIVE" | "DISPOSED" | "FULLY_DEPRECIATED"

export type Depreciable = {
  purchase_price: number | null
  purchase_date: string | null
  useful_life_months: number | null
  currency: Currency
  salvage_value?: number | null
  status?: string | null
  disposed_on?: string | null
}

const round = (n: number, currency: Currency) => (currency === "KHR" ? Math.round(n) : Math.round(n * 100) / 100)

/** Completed months from one YYYY-MM-DD to another (a month counts once its day is reached); negative before. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0)
}

/** The day before a YYYY-MM-DD. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The depreciation schedule as of `asOf`, or null when the asset doesn't depreciate
 * (no useful life, cost or purchase date).
 */
export function schedule(asset: Depreciable, asOf: string) {
  const life = asset.useful_life_months
  const cost = asset.purchase_price
  if (!life || life <= 0 || cost == null || !asset.purchase_date) return null
  const salvage = Math.min(Math.max(0, asset.salvage_value ?? 0), cost)
  const depreciable = cost - salvage
  const disposed = asset.status === "DISPOSED"
  // Depreciation stops when the asset is disposed of.
  const until = disposed && asset.disposed_on && asset.disposed_on < asOf ? asset.disposed_on : asOf
  const elapsed = Math.max(0, Math.min(life, monthsBetween(asset.purchase_date, until)))
  const accumulated = elapsed >= life ? depreciable : Math.min(depreciable, round((depreciable / life) * elapsed, asset.currency))
  const status: FixedAssetStatus = disposed ? "DISPOSED" : elapsed >= life ? "FULLY_DEPRECIATED" : "ACTIVE"
  return {
    cost,
    salvage,
    depreciable,
    monthly: round(depreciable / life, asset.currency),
    life,
    elapsed,
    remainingMonths: life - elapsed,
    accumulated: round(accumulated, asset.currency),
    netBookValue: round(cost - accumulated, asset.currency),
    status,
  }
}

/** Depreciation charged between two dates (inclusive), in the asset's currency: the fall in book value. */
export function depreciationBetween(asset: Depreciable, from: string, to: string): number {
  if (to < from) return 0
  const end = schedule(asset, to)
  const start = schedule(asset, dayBefore(from))
  return end && start ? round(end.accumulated - start.accumulated, asset.currency) : 0
}

type Bucket = Record<Currency, number>

/**
 * Register totals by currency as of `asOf` — original cost, accumulated depreciation and
 * net book value of the assets still held (disposed ones are left out).
 */
export function registerTotals(assets: Depreciable[], asOf: string) {
  const cost: Bucket = { USD: 0, KHR: 0 }
  const accumulated: Bucket = { USD: 0, KHR: 0 }
  const nbv: Bucket = { USD: 0, KHR: 0 }
  for (const a of assets) {
    const s = schedule(a, asOf)
    if (!s || s.status === "DISPOSED") continue
    cost[a.currency] += s.cost
    accumulated[a.currency] += s.accumulated
    nbv[a.currency] += s.netBookValue
  }
  const fix = (b: Bucket): Bucket => ({ USD: round(b.USD, "USD"), KHR: round(b.KHR, "KHR") })
  return { cost: fix(cost), accumulated: fix(accumulated), nbv: fix(nbv) }
}
