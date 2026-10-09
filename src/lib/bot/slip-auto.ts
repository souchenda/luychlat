/**
 * Zero-click slips: a bank slip whose payee is known is saved at once, with
 * override buttons, instead of waiting for a category tap. Known means:
 *   A. the user's own habit — what they chose last time for this merchant
 *      (user_merchant_memory, learned from every tap and override), else
 *   B. an unmistakable payee — a café, a restaurant, a fuel station, a mart.
 * Anything else still asks. Pure (slip-auto.test.ts).
 */

import { SLIP_OUT } from "./bank-slip"

/** A slip button's short key: "bot.slipCat.coffee" → "coffee". */
export type ChoiceKey = "food" | "coffee" | "fuel" | "shopping" | "home" | "other"

export const choiceKey = (label: string) => label.split(".").pop() as ChoiceKey
export const choiceIndex = (key: ChoiceKey) => SLIP_OUT.findIndex((c) => choiceKey(c.label) === key)

/** "360 DEGREE COFFEE " / "360  Degree Coffee" → "360 degree coffee" (the memory's key). */
export function merchantKey(party: string | null | undefined): string | null {
  const k = (party ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80)
  return k.length >= 3 ? k : null
}

const COFFEE = /coffee|caf[eé]|កាហ្វេ|\b(?:amazon|brown|tube|koi|starbucks|chatime|gong ?cha|costa|tous les jours)\b|milk ?tea|bubble ?tea/i
const RESTAURANT = /restaurant|eatery|kitchen|\b(?:bbq|noodles?|pho|dining|bistro|canteen)\b|បាយ|គុយទាវ|ភោជនីយដ្ឋាន|អាហារដ្ឋាន|ហាងបាយ/i
const FUEL = /\b(?:total(?:energies)?|caltex|tela|ptt|sokimex|petronas|lhr|champa|star ?fuel)\b|ស្ថានីយប្រេង|ប្រេងឥន្ធនៈ/i
const MART = /\b(?:mart|supermarket|market|aeon|chip ?mong|lucky|makro|7-?eleven|circle ?k|family ?mart|zay ?zay)\b|ផ្សារ/i

/** HH:MM inside a meal window: breakfast 06:00–10:30, lunch 11:00–14:00, dinner 17:00–21:00. */
function mealHour(time: string | null): boolean {
  const m = time ? /^(\d{2}):(\d{2})$/.exec(time) : null
  if (!m) return false
  const t = Number(m[1]) * 60 + Number(m[2])
  return (t >= 360 && t <= 630) || (t >= 660 && t <= 840) || (t >= 1020 && t <= 1260)
}

/**
 * B. The payee alone makes it clear (coffee is checked first: "Brown Coffee & Bakery" is coffee,
 * not a meal). A restaurant counts at meal times (a 3 AM "kitchen" payment stays a question).
 */
export function heuristicChoice(party: string | null | undefined, time: string | null): ChoiceKey | null {
  const p = party ?? ""
  if (!p.trim()) return null
  if (COFFEE.test(p)) return "coffee"
  if (FUEL.test(p)) return "fuel"
  if (RESTAURANT.test(p)) return mealHour(time) ? "food" : null
  if (MART.test(p)) return "shopping"
  return null
}

export type Remembered = { choice: ChoiceKey | null; category_id: string; need_want: "NEED" | "WANT" | null }

/** A then B: the user's habit wins; the payee rules only when there's none. */
export function autoDecision(
  party: string | null | undefined,
  time: string | null,
  remembered: Remembered | null,
): { source: "memory"; remembered: Remembered } | { source: "rule"; choice: ChoiceKey } | null {
  if (remembered) return { source: "memory", remembered }
  const choice = heuristicChoice(party, time)
  return choice ? { source: "rule", choice } : null
}
