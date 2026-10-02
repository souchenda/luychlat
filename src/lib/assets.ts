import type { Currency, Debt } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { convert, roundMoney } from "@/lib/money"

/** Land, house, vehicles, machinery… with an estimated market value (table physical_assets). */
export type AssetKind = "LAND" | "HOUSE" | "VEHICLE" | "MACHINERY" | "OTHER"
export const ASSET_KINDS: AssetKind[] = ["LAND", "HOUSE", "VEHICLE", "MACHINERY", "OTHER"]
export const ASSET_EMOJI: Record<AssetKind, string> = { LAND: "🏞️", HOUSE: "🏠", VEHICLE: "🚗", MACHINERY: "🚜", OTHER: "📦" }

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
  created_at: string
}
export type PhysicalAssetInput = Pick<PhysicalAsset, "kind" | "name" | "estimated_value" | "currency" | "purchase_date" | "purchase_price" | "debt_id" | "note">

/**
 * Net equity of an asset in its own currency: value minus what is still owed
 * on the linked loan (converted at the app rate). Null loan = full value.
 */
export function assetEquity(asset: Pick<PhysicalAsset, "estimated_value" | "currency">, loan: Debt | undefined, khrPerUsd: number) {
  const owed = loan ? roundMoney(convert(remaining(loan), loan.currency, asset.currency, khrPerUsd), asset.currency) : 0
  const equity = roundMoney(asset.estimated_value - owed, asset.currency)
  // Share of the asset already owned (0–100).
  const ownedPercent = asset.estimated_value > 0 ? Math.max(0, Math.min(100, Math.round((equity / asset.estimated_value) * 1000) / 10)) : 0
  return { owed, equity, ownedPercent }
}

/** Total estimated value of physical assets in USD. */
export function assetsTotalUsd(assets: Pick<PhysicalAsset, "estimated_value" | "currency">[], khrPerUsd: number): number {
  return roundMoney(assets.reduce((sum, a) => sum + convert(a.estimated_value, a.currency, "USD", khrPerUsd), 0), "USD")
}
