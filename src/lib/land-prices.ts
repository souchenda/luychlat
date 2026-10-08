/**
 * Area price reference for land in Phnom Penh: the min–max land price per m² for
 * each Khan, from the Cambodian Valuers and Estate Agents Association (CVEA)
 * report for H2 2025, published by realestate.com.kh on 26 May 2026
 * (mass appraisal: valuers' questionnaires, not recorded sales).
 *
 * Advisory only — a hint beside the owner's own estimate, never a value that is
 * filled in or counted. Phnom Penh only: the report has no provincial data.
 * New report (twice a year): replace LAND_PRICE_SOURCE and the table together.
 */

export const LAND_PRICE_SOURCE = {
  credit: "CVEA / realestate.com.kh",
  period: "H2 2025",
  published: "2026-05-26",
  url: "https://www.realestate.com.kh/news/phnom-penh-land-prices-2025-h2/",
}

export type KhanPrice = { key: string; km: string; en: string; min: number; max: number }

/** USD per m², in the report's order (highest-priced Khans first). */
export const PHNOM_PENH_KHANS: KhanPrice[] = [
  { key: "daun_penh", km: "ដូនពេញ", en: "Daun Penh", min: 1600, max: 10400 },
  { key: "bkk", km: "បឹងកេងកង", en: "Boeung Keng Kang", min: 1700, max: 6300 },
  { key: "7_makara", km: "៧មករា", en: "7 Makara", min: 2100, max: 6600 },
  { key: "chamkarmorn", km: "ចំការមន", en: "Chamkarmorn", min: 1200, max: 5800 },
  { key: "toul_kork", km: "ទួលគោក", en: "Toul Kork", min: 1400, max: 4800 },
  { key: "mean_chey", km: "មានជ័យ", en: "Mean Chey", min: 380, max: 2850 },
  // The report prints this maximum as "$2,4700"; read as $2,470 (between Sen Sok's $2,430 and Mean Chey's $2,850).
  { key: "russey_keo", km: "ឫស្សីកែវ", en: "Russey Keo", min: 290, max: 2470 },
  { key: "sen_sok", km: "សែនសុខ", en: "Sen Sok", min: 180, max: 2430 },
  { key: "chroy_changvar", km: "ជ្រោយចង្វារ", en: "Chroy Changvar", min: 19, max: 2380 },
  { key: "chbar_ampov", km: "ច្បារអំពៅ", en: "Chbar Ampov", min: 20, max: 2280 },
  { key: "por_senchey", km: "ពោធិ៍សែនជ័យ", en: "Por Senchey", min: 50, max: 1890 },
  { key: "dangkor", km: "ដង្កោ", en: "Dangkor", min: 18, max: 1530 },
  { key: "prek_pnov", km: "ព្រែកព្នៅ", en: "Prek Pnov", min: 9, max: 900 },
  { key: "kamboul", km: "កំបូល", en: "Kamboul", min: 18, max: 990 },
]

/** The location choice for land outside Phnom Penh (no reference data yet). */
export const PROVINCE = "province"

export const khanOf = (key: string | null | undefined) => PHNOM_PENH_KHANS.find((k) => k.key === key) ?? null

/** The reference range for a plot: $/m² and, with an area, the total. Null outside Phnom Penh. */
export function landReference(location: string | null | undefined, areaM2: number | null | undefined) {
  const khan = khanOf(location)
  if (!khan) return null
  const area = areaM2 && areaM2 > 0 ? areaM2 : null
  return { khan, low: area ? Math.round(khan.min * area) : null, high: area ? Math.round(khan.max * area) : null }
}
