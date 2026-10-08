import type { Currency, Debt } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { convert, roundMoney } from "@/lib/money"

/**
 * Land, house, vehicles, machinery, electronics, furniture… (table physical_assets):
 * an estimated market value, or — with a useful life — a book value that
 * depreciates straight-line from the purchase cost.
 */
export type AssetKind = "LAND" | "HOUSE" | "VEHICLE" | "MACHINERY" | "ELECTRONICS" | "FURNITURE" | "OTHER"
export const ASSET_KINDS: AssetKind[] = ["LAND", "HOUSE", "VEHICLE", "MACHINERY", "ELECTRONICS", "FURNITURE", "OTHER"]
export const ASSET_EMOJI: Record<AssetKind, string> = {
  LAND: "🏞️",
  HOUSE: "🏠",
  VEHICLE: "🚗",
  MACHINERY: "🚜",
  ELECTRONICS: "💻",
  FURNITURE: "🪑",
  OTHER: "📦",
}

/** Useful-life choices in the form (years); null = no depreciation (the estimate is the value). */
export const LIFE_YEARS = [2, 3, 5, 10] as const
/** A new asset's useful life by kind: things that wear out depreciate by default; land and homes don't. */
export const DEFAULT_LIFE_YEARS: Record<AssetKind, number | null> = {
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
  created_at: string
}
export type PhysicalAssetInput = Pick<
  PhysicalAsset,
  "kind" | "name" | "estimated_value" | "currency" | "purchase_date" | "purchase_price" | "debt_id" | "note" | "useful_life_months"
>

type Depreciable = Pick<PhysicalAsset, "purchase_price" | "purchase_date" | "useful_life_months" | "currency">

/** Whole months from one YYYY-MM-DD to another (a month counts once its day is reached). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0)
}

/** Today as YYYY-MM-DD in the device's time zone. */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Straight-line depreciation as of `today`: the same amount each month, from the
 * purchase cost down to 0 at the end of the useful life. $1,350 over 3 years →
 * $37.50 a month; after 12 months the book value is $900. Null when the asset
 * doesn't depreciate (no useful life, cost or purchase date).
 */
export function depreciation(asset: Depreciable, today: string = localToday()) {
  const life = asset.useful_life_months
  if (!life || life <= 0 || asset.purchase_price == null || !asset.purchase_date) return null
  const cost = asset.purchase_price
  const monthly = roundMoney(cost / life, asset.currency)
  const elapsed = Math.max(0, Math.min(life, monthsBetween(asset.purchase_date, today)))
  // The last month takes the rounding remainder, so the book value ends at exactly 0.
  const bookValue = elapsed >= life ? 0 : Math.max(0, roundMoney(cost - (cost / life) * elapsed, asset.currency))
  return { monthly, elapsed, life, bookValue, depreciated: roundMoney(cost - bookValue, asset.currency), done: elapsed >= life }
}

/** What an asset is worth now: its depreciated book value, else the owner's estimate. */
export function currentValue(asset: Depreciable & Pick<PhysicalAsset, "estimated_value">, today?: string): number {
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

/** Total current value of physical assets in USD (book value for depreciating ones) — what net worth counts. */
export function assetsTotalUsd(assets: (Depreciable & Pick<PhysicalAsset, "estimated_value">)[], khrPerUsd: number): number {
  return roundMoney(assets.reduce((sum, a) => sum + convert(currentValue(a), a.currency, "USD", khrPerUsd), 0), "USD")
}
