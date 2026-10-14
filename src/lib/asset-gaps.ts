// Which assets the net worth could NOT count right now (founder rule: no silent guessing on money).
// A failed load, or gold the app has no price for (today's market rates didn't load), would otherwise
// count as $0 and the headline would simply be smaller — the card says so instead.

export type AssetGap = "gold" | "diamonds" | "investments" | "property"

export function assetGaps(o: {
  goldError: boolean
  /** Holdings with no rate to value them (portfolio().unpriced). */
  goldUnpriced: number
  diamondsError: boolean
  investmentsError: boolean
  propertyError: boolean
}): AssetGap[] {
  const gaps: AssetGap[] = []
  if (o.goldError || o.goldUnpriced > 0) gaps.push("gold")
  if (o.diamondsError) gaps.push("diamonds")
  if (o.investmentsError) gaps.push("investments")
  if (o.propertyError) gaps.push("property")
  return gaps
}
