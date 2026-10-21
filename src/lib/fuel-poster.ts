/**
 * The fuel price poster's content (founder, 21/10/2026 — «text-only fuel posts get low reach»): what the 1080 × 1080
 * graphic says, from the Ministry's prices and the cycle before. Posters keep Khmer digits (rule 7) and carry no
 * parentheses (docs/BRAND_DESIGN_SYSTEM.md, Typography). Pure (fuel-poster.test.ts); drawn by lib/server/fuel-poster.ts.
 */
import type { FuelCycle, FuelPrices } from "@/lib/market-calc"

const KM = "០១២៣៤៥៦៧៨៩"
const km = (s: string) => s.replace(/\d/g, (d) => KM[Number(d)])
const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** «៥,០៥០». */
export const kmRiel = (n: number) => km(new Intl.NumberFormat("en-US").format(n))

export type ChangeTone = "down" | "up" | "same"
export type FuelChange = { tone: ChangeTone; text: string }

/** The badge: «▼ ចុះ ៣០០ ៛», «▲ ឡើង ១០០ ៛», «មិនប្រែប្រួល» — or nothing when the cycle before is unknown. */
export function fuelChange(now: number, before: number | null | undefined): FuelChange | null {
  if (before == null) return null
  if (now === before) return { tone: "same", text: "មិនប្រែប្រួល" }
  return now < before ? { tone: "down", text: `▼ ចុះ ${kmRiel(before - now)} ៛` } : { tone: "up", text: `▲ ឡើង ${kmRiel(now - before)} ៛` }
}

/** «ចាប់ពីថ្ងៃទី ២១ តុលា ដល់ ០១ វិច្ឆិកា ២០២៦» (the year once when both ends share it). */
export function cycleLine(from: string, to: string): string {
  const part = (iso: string, year: boolean) => `${km(iso.slice(8, 10))} ${KM_MONTHS[Number(iso.slice(5, 7)) - 1]}${year ? ` ${km(iso.slice(0, 4))}` : ""}`
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `ចាប់ពីថ្ងៃទី ${part(from, !sameYear)} ដល់ ${part(to, true)}`
}

export type FuelPosterCard = { label: string; code: string; price: string; unit: string; change: FuelChange | null }
export type FuelPoster = { pill: string; title: string; cycle: string; source: string; cards: FuelPosterCard[] }

export const FUEL_POSTER_TITLE = "តម្លៃលក់រាយប្រេងឥន្ធនៈផ្លូវការ"

export function fuelPosterContent(fuel: Pick<FuelPrices, "regular" | "super" | "diesel" | "from" | "to">, previous: Pick<FuelCycle, "regular" | "super" | "diesel"> | null): FuelPoster {
  const card = (label: string, code: string, price: number, before: number | null | undefined): FuelPosterCard => ({
    label,
    code,
    price: kmRiel(price),
    unit: "៛ / លីត្រ",
    change: fuelChange(price, before),
  })
  return {
    pill: "តម្លៃប្រេង",
    title: FUEL_POSTER_TITLE,
    cycle: cycleLine(fuel.from, fuel.to),
    source: "សេចក្តីជូនដំណឹង ក្រសួងពាណិជ្ជកម្ម",
    cards: [
      card("សាំងធម្មតា", "EA92", fuel.regular, previous?.regular),
      // EA95 only when the notice lists it — never a placeholder.
      ...(fuel.super ? [card("សាំងស៊ុបពែរ", "EA95", fuel.super, previous?.super)] : []),
      card("ប្រេងម៉ាស៊ូត", "DIESEL", fuel.diesel, previous?.diesel),
    ],
  }
}
