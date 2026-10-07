/**
 * Smart default for Need vs Want (ចាំបាច់ / ចំណង់) on an expense, so everyday
 * essentials are never left for the user to tap. Pure; shared by the bot (slip
 * cards) and the app (new entries). The user can always switch it.
 *
 * Order: words in the payee / note first (school supplies under Shopping are a
 * need; beer under Food is a want), then the category and the meal.
 */
import type { Meal, NeedWant } from "@/lib/data/types"

const NEED_WORDS =
  /សាំង|ប្រេង(?:ឥន្ធនៈ|សាំង|ម៉ាស៊ូត)|ម៉ាស៊ូត|\b(?:fuel|petrol|gasoline|diesel)\b|ថ្លៃផ្ទះ|ជួលផ្ទះ|\brent\b|ទឹកភ្លើង|អគ្គិសនី|\bedc\b|ទឹកស្អាត|ថ្លៃទឹក|ថ្លៃភ្លើង|សំរាម|\b(?:electricity|water bill|garbage)\b|ថ្នាំ|ពេទ្យ|គ្លីនិក|ឱសថ|\b(?:hospital|clinic|pharmacy|medicine|doctor)\b|សាលា|សិក្សា|ថ្លៃរៀន|\b(?:tuition|school)\b|រំលស់|បង់កម្ចី|\b(?:loan|installment)\b/i

const WANT_WORDS =
  /កាហ្វេ|\b(?:coffee|cafe|café|starbucks|amazon|brown|chatime|koi)\b|តែក្រឡុក|តែគុជ|\bmilk ?tea\b|\bbubble ?tea\b|ភេសជ្ជៈ|ស្រាបៀរ|\bbeer\b|\bwine\b|ជប់លៀង|\bparty\b|ខារ៉ាអូខេ|\bkaraoke\b|កម្សាន្ត|ភាពយន្ត|\b(?:cinema|movie|game)\b|ហ្គេម|ខោអាវ|\b(?:clothes|fashion)\b|គ្រឿងតុបតែង|គ្រឿងសំអាង|\b(?:cosmetics?|makeup)\b/i

/** Categories that are needs (essentials and running costs) or wants (discretionary). */
const NEED_PRESETS = new Set([
  "transport",
  "housing",
  "rent",
  "utilities",
  "phone",
  "health",
  "education",
  "debt_repayment",
  "loan_interest",
  "loan_insurance",
  "tontine_payment",
  "tax",
  "inventory",
  "payroll",
  "delivery",
])
const WANT_PRESETS = new Set(["entertainment", "shopping"])

export function defaultNeedWant(input: { preset: string | null | undefined; meal?: Meal | null; text?: string | null }): NeedWant | null {
  const text = input.text ?? ""
  if (NEED_WORDS.test(text)) return "NEED"
  if (WANT_WORDS.test(text)) return "WANT"
  const preset = input.preset ?? ""
  // Food: the three meals (and groceries without a meal) are needs; coffee / snacks are wants.
  if (preset === "food") return input.meal === "snack" ? "WANT" : "NEED"
  if (NEED_PRESETS.has(preset)) return "NEED"
  if (WANT_PRESETS.has(preset)) return "WANT"
  return null
}
