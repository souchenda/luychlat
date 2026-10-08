import type { Currency, Debt } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { dayBefore, depreciationBetween, schedule, type FixedAssetCategory } from "@/lib/fixed-assets"
import { convert, roundMoney } from "@/lib/money"

export { monthsBetween } from "@/lib/fixed-assets"

/**
 * Land, house, vehicles, machinery, electronics, furniture… (table physical_assets):
 * an estimated market value, or — with a useful life — a book value that
 * depreciates straight-line from the purchase cost (src/lib/fixed-assets.ts).
 * A business's register uses the standard categories (FixedAssetCategory) and STOCK.
 */
export type PersonalAssetKind = "LAND" | "HOUSE" | "VEHICLE" | "MACHINERY" | "ELECTRONICS" | "FURNITURE" | "OTHER"
export type AssetKind = PersonalAssetKind | Exclude<FixedAssetCategory, "OTHER"> | "STOCK"
export const ASSET_KINDS: PersonalAssetKind[] = ["LAND", "HOUSE", "VEHICLE", "MACHINERY", "ELECTRONICS", "FURNITURE", "OTHER"]
export const ASSET_EMOJI: Record<AssetKind, string> = {
  LAND: "🏞️",
  HOUSE: "🏠",
  VEHICLE: "🚗",
  MACHINERY: "🚜",
  ELECTRONICS: "💻",
  FURNITURE: "🪑",
  OTHER: "📦",
  BUILDINGS_LEASEHOLD: "🏢",
  MACHINERY_EQUIPMENT: "⚙️",
  VEHICLES: "🚚",
  FURNITURE_FIXTURES: "🪑",
  IT_ELECTRONICS: "💻",
  STOCK: "🏷️",
}

/** Useful-life choices in the personal form (years); null = no depreciation (the estimate is the value). */
export const LIFE_YEARS = [2, 3, 5, 10] as const
/** A new personal asset's useful life by kind: things that wear out depreciate by default; land and homes don't. */
export const DEFAULT_LIFE_YEARS: Record<PersonalAssetKind, number | null> = {
  LAND: null,
  HOUSE: null,
  VEHICLE: 5,
  MACHINERY: 5,
  ELECTRONICS: 3,
  FURNITURE: 5,
  OTHER: null,
}

export type PhysicalAsset = {
  id: string
  workspace_id: string
  kind: AssetKind
  name: string
  estimated_value: number
  currency: Currency
  purchase_date: string | null
  purchase_price: number | null
  debt_id: string | null
  note: string | null
  /** Straight-line depreciation over this many months; null = none. */
  useful_life_months: number | null
  /** Book value the asset depreciates down to (0 by default). */
  salvage_value: number
  /** Business register: asset tag or serial number. */
  serial_or_reference: string | null
  /** ACTIVE or DISPOSED (FULLY_DEPRECIATED is derived — see schedule()). */
  status: "ACTIVE" | "DISPOSED"
  disposed_on: string | null
  /** Land / house: a Phnom Penh Khan key or "province" (src/lib/land-prices.ts), and the plot size. */
  location: string | null
  area_m2: number | null
  created_at: string
}

/** Kinds that take a location and plot size (for the area price reference). */
export const hasPlot = (kind: AssetKind) => kind === "LAND" || kind === "HOUSE"
export type PhysicalAssetInput = Pick<
  PhysicalAsset,
  "kind" | "name" | "estimated_value" | "currency" | "purchase_date" | "purchase_price" | "debt_id" | "note" | "useful_life_months" | "location" | "area_m2"
> &
  Partial<Pick<PhysicalAsset, "salvage_value" | "serial_or_reference" | "status" | "disposed_on">>

type Depreciable = Pick<PhysicalAsset, "purchase_price" | "purchase_date" | "useful_life_months" | "currency"> &
  Partial<Pick<PhysicalAsset, "salvage_value" | "status" | "disposed_on">>

/** Today as YYYY-MM-DD in the device's time zone. */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Straight-line depreciation as of `today` (src/lib/fixed-assets.ts): the same amount each
 * month, from the purchase cost down to the salvage value at the end of the useful life.
 * $1,350 over 3 years → $37.50 a month; after 12 months the book value is $900. Null when
 * the asset doesn't depreciate (no useful life, cost or purchase date).
 */
export function depreciation(asset: Depreciable, today: string = localToday()) {
  const s = schedule(asset, today)
  if (!s) return null
  return { monthly: s.monthly, elapsed: s.elapsed, life: s.life, bookValue: s.netBookValue, depreciated: s.accumulated, done: s.status === "FULLY_DEPRECIATED" }
}

/** What an asset is worth now: its depreciated book value, else the owner's estimate; nothing once disposed of. */
export function currentValue(asset: Depreciable & Pick<PhysicalAsset, "estimated_value">, today?: string): number {
  if (asset.status === "DISPOSED") return 0
  return depreciation(asset, today)?.bookValue ?? asset.estimated_value
}

/**
 * Net equity of an asset in its own currency: value minus what is still owed
 * on the linked loan (converted at the app rate). Null loan = full value.
 */
export function assetEquity(asset: Depreciable & Pick<PhysicalAsset, "estimated_value">, loan: Debt | undefined, khrPerUsd: number) {
  const value = currentValue(asset)
  const owed = loan ? roundMoney(convert(remaining(loan), loan.currency, asset.currency, khrPerUsd), asset.currency) : 0
  const equity = roundMoney(value - owed, asset.currency)
  // Share of the asset already owned (0–100).
  const ownedPercent = value > 0 ? Math.max(0, Math.min(100, Math.round((equity / value) * 1000) / 10)) : 0
  return { owed, equity, ownedPercent }
}

/**
 * Depreciation charged in a period (non-cash): for each depreciating asset, how much its
 * book value fell between `from` and `to` (stopping at a disposal). Stock never depreciates.
 */
export function depreciationForPeriod(assets: (Depreciable & Pick<PhysicalAsset, "id" | "name" | "kind">)[], from: string, to: string) {
  const lines = assets
    .filter((a) => a.kind !== "STOCK")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency, amount: depreciationBetween(a, from, to) }))
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const usd = roundMoney(lines.filter((l) => l.currency === "USD").reduce((s, l) => s + l.amount, 0), "USD")
  const khr = roundMoney(lines.filter((l) => l.currency === "KHR").reduce((s, l) => s + l.amount, 0), "KHR")
  return { usd, khr, lines }
}

export { dayBefore }

/** Total current value of physical assets in USD (book value for depreciating ones) — what net worth counts. */
export function assetsTotalUsd(assets: (Depreciable & Pick<PhysicalAsset, "estimated_value">)[], khrPerUsd: number): number {
  return roundMoney(assets.reduce((sum, a) => sum + convert(currentValue(a), a.currency, "USD", khrPerUsd), 0), "USD")
}
