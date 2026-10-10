/**
 * EV driving economics for the month (founder, 10/10): total energy cost (home kWh at the
 * electricity rate + public charging), cost per km, and the saving against a petrol car at the
 * live Ministry of Commerce price (EA95 when the notice lists it, else EA92) and 8.5 L/100 km.
 * Rounding rule: per-km rates keep their precision; riel TOTALS go to the nearest 100៛.
 * Pure (ev-economics.test.ts).
 */

import { roundToNearest100KHR } from "@/lib/currency"

/** A typical petrol car's consumption, the benchmark. */
export const PETROL_L_PER_100KM = 8.5

export type EvMonth = {
  homeKwh: number
  /** Riel per kWh (the electricity bill's, else 730). */
  rate: number
  publicUsd: number
  khrPerUsd: number
  /** Kilometres driven this month (0 when not known). */
  km: number
  /** Riel per litre of petrol (live MoC price), null when unknown. */
  petrolPerLitre: number | null
}

export type EvEconomics = {
  /** Home + public, riel, nearest 100៛. */
  totalKhr: number
  totalUsd: number
  /** Precise (not rounded to 100). Null without a distance. */
  perKmKhr: number | null
  perKmUsd: number | null
  /** What a petrol car would have cost for the same km, nearest 100៛. */
  petrolKhr: number | null
  /** petrol − EV (negative when the EV cost more), nearest 100៛. */
  savingsKhr: number | null
  savingsUsd: number | null
}

const usd2 = (khr: number, rate: number) => Math.round((khr / rate) * 100) / 100

export function evEconomics(m: EvMonth): EvEconomics {
  const exact = m.homeKwh * m.rate + m.publicUsd * m.khrPerUsd
  const totalKhr = roundToNearest100KHR(exact)
  const hasKm = m.km > 0
  const perKmKhr = hasKm ? Math.round((exact / m.km) * 10) / 10 : null
  const petrolExact = hasKm && m.petrolPerLitre ? (m.km / 100) * PETROL_L_PER_100KM * m.petrolPerLitre : null
  const savingsKhr = petrolExact !== null ? roundToNearest100KHR(petrolExact - exact) : null
  return {
    totalKhr,
    totalUsd: usd2(totalKhr, m.khrPerUsd),
    perKmKhr,
    perKmUsd: hasKm ? Math.round((exact / m.km / m.khrPerUsd) * 1000) / 1000 : null,
    petrolKhr: petrolExact !== null ? roundToNearest100KHR(petrolExact) : null,
    savingsKhr,
    savingsUsd: savingsKhr !== null ? usd2(savingsKhr, m.khrPerUsd) : null,
  }
}

/** The live petrol price for the benchmark: EA95 when the notice lists it, else EA92. */
export const benchmarkPetrol = (fuel: { super?: number | null; regular?: number | null } | null | undefined) =>
  fuel?.super && fuel.super > 0 ? fuel.super : fuel?.regular && fuel.regular > 0 ? fuel.regular : null

export type DistanceEntry = { kind: "ODOMETER" | "TRIP"; km: number }

const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)))

/**
 * "គីឡូឡាន 15200" / "odometer 15,200" → the car's odometer; "ចម្ងាយ 120 គម" / "បើក 120km" /
 * "trip 120 km" → a trip. Null for anything else (an ordinary entry).
 */
export function parseDistance(raw: string): DistanceEntry | null {
  const text = latin(raw).toLowerCase().replace(/,/g, "").trim()
  const num = /(\d+(?:\.\d+)?)/.exec(text)
  if (!num) return null
  const km = Number(num[1])
  if (!(km > 0)) return null
  if (/គីឡូឡាន|odometer|odo\b|ម៉ោងឡាន|កុងទ័រឡាន/.test(text)) return km < 2_000_000 ? { kind: "ODOMETER", km } : null
  const unit = /(គម|គ\.ម|គីឡូម៉ែត្រ|\bkm\b|\d\s*km\b)/.test(text)
  if (/ចម្ងាយ|បើកបរ|បើកឡាន|\btrip\b|\bdrove\b|\bdistance\b/.test(text) && unit) return km <= 3000 ? { kind: "TRIP", km } : null
  return null
}
