/**
 * What a photo sent to the bot is for — the human first. A caption says what the person meant,
 * so it is followed before any reading of the picture; the picture is then its evidence.
 *   ev     "សាកឡាននៅផ្ទះ 56.9kwh", "សាកឡាន 56.9 kwh": home charging (no money in it)
 *   entry  "កាហ្វេ 2$", "លក់បាន 120$": that entry, with the photo as its receipt
 *   loan   "តារាងកាលវិភាគកម្ចី", "repayment schedule" (no amount): a loan schedule to read and save
 *   slip   no caption, or a caption that only describes ("ទិញសម្ភារៈសិក្សាឱ្យកូន"): the photo is read
 *          (bank slip · EV screen · paper bill), the caption kept as the note
 * Pure (photo-route.test.ts).
 */

import { isEvCharge, isEvHome, kwhOf, parseAmountText, toLatinDigits } from "./parse-entry"

/** Charging logged as usage: a home word, or kWh with no money in the text. */
export function isEvUsage(text: string): boolean {
  if (isEvHome(text)) return true
  if (!isEvCharge(text) || !kwhOf(text)) return false
  // "សាកឡាន 56.9 kwh" is usage; "សាកឡាន 8$ 20kwh" (paid at a station) is an expense.
  const withoutKwh = toLatinDigits(text).replace(/(\d+(?:[.,]\d+)?)\s*(kwh|kw\/h|kw[·.-]h|គីឡូវ៉ាត់(?:ម៉ោង)?|度)/gi, " ")
  return !parseAmountText(withoutKwh)
}

export type PhotoRoute = "ev" | "entry" | "loan" | "slip"

/** A caption naming a loan repayment schedule (an amount makes it a repayment entry instead). */
const LOAN_SCHEDULE = /កាលវិភាគ|តារាង.*(?:កម្ចី|សង|បង់)|repayment|schedule|amorti[sz]ation|还款计划/i

export function photoRoute(caption: string | null | undefined): PhotoRoute {
  const text = caption?.trim() ?? ""
  if (!text) return "slip"
  if (isEvUsage(text)) return "ev"
  if (parseAmountText(toLatinDigits(text))) return "entry"
  if (LOAN_SCHEDULE.test(text)) return "loan"
  return "slip"
}
