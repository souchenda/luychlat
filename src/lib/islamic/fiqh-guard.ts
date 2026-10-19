import * as G from "@/lib/islamic/glossary"

/**
 * The guarded Islamic reference assistant (founder, 19/10/2026): a respectful navigator of widely held Sunni / Shafi'i
 * teaching as followed in Cambodia — never a Mufti, never a fatwa. Three guards, all here and pure (fiqh-guard.test.ts):
 *   1. before the model: divorce (talaq), inheritance and sectarian questions get the fixed referral at once — they
 *      never reach the model;
 *   2. the system prompt: the persona, the school, sources only when sure, and the referral marker for anything that
 *      needs a scholar's decision;
 *   3. after the model: the marker or a boundary topic in the answer → the referral; every reply ends with the
 *      educational-purpose disclaimer.
 */

/** The founder's referral (19/10/2026), with the app's spelling of «អ៊ីម៉ាម» (lib/islamic/glossary, the du'a pages). */
export const FIQH_REFERRAL = {
  km: "បញ្ហានេះទាមទារការសម្រេចផ្ទាល់ពីគណៈអ៊ីម៉ាម ឬលោកគ្រូ។ សូមពិគ្រោះជាមួយអ្នកជំនាញច្បាប់សាសនាដោយផ្ទាល់។",
  en: "This question needs a direct decision from the council of Imams or a teacher. Please consult a qualified scholar of Islamic law in person.",
} as const

/** On every reply. */
export const FIQH_DISCLAIMER = {
  km: "ℹ️ ចម្លើយនេះសម្រាប់គោលបំណងអប់រំទូទៅប៉ុណ្ណោះ — មិនមែនជាហ្វាតវ៉ា (ការវិនិច្ឆ័យផ្លូវការ) ទេ។ សម្រាប់ករណីផ្ទាល់ខ្លួន សូមពិគ្រោះជាមួយអ៊ីម៉ាម ឬលោកគ្រូក្នុងស្រុក។",
  en: "ℹ️ For general educational purposes only — not a fatwa (formal ruling). For your own situation, please consult your local Imam or teacher.",
} as const

/** The model writes this, alone, when a question needs a scholar's decision. */
export const REFER_MARKER = "[[REFER_TO_IMAM]]"

export type FiqhBoundary = "talaq" | "inheritance" | "sectarian"

const BOUNDARIES: Record<FiqhBoundary, RegExp> = {
  talaq: /លែងលះ|លែងប្ដី|លែងប្តី|លែងប្រពន្ធ|ប្ដីលែង|ប្តីលែង|តាឡាក់|ថាឡាក់|ខុលអ៍|\b(?:divorc\w*|talaq|talak|khula?|iddah)\b|طلاق|خلع/i,
  inheritance: /មរតក|កេរ្តិ៍មរតក|ចែកកេរ|ផារ៉ាអ៊ិដ|\b(?:inherit\w*|heirs?|faraid|fara'?idh|mirath|wasiyyah)\b|ميراث|إرث|ارث|فرائض|وصية/i,
  sectarian: /ស៊ីអះ|ស៊ីអ៊ីត|ស៊ីអា|វ៉ាហាប៊ី|សាឡាហ្វ៊ី|អះម៉ាឌី|និកាយ|អ៊ីម៉ាមសាន|កាហ្វៀរ|\b(?:shi'?a|shia|shiite|shi'ite|wahhab\w*|salafi\w*|ahmadi\w*|takfir\w*|kafir|kuffar|sects?|sectarian|imam san)\b|شيعة|وهابي|سلفي|تكفير|كافر/i,
}

/** The boundary a question touches, or null. */
export function fiqhBoundary(text: string): FiqhBoundary | null {
  for (const key of Object.keys(BOUNDARIES) as FiqhBoundary[]) if (BOUNDARIES[key].test(text)) return key
  return null
}

export const FIQH_QUESTION_MAX = 500

export function fiqhSystemPrompt(locale: "km" | "en"): string {
  return [
    "You are the Islamic reference navigator of App Luy Chlat (អេប លុយឆ្លាត), for Cambodian Muslims (mostly Cham).",
    "You are a respectful, scholarly guide to widely held teaching — NOT a Mufti and NOT an authority. Never issue a fatwa or a personal ruling; describe what the mainstream Sunni scholars, and in particular the Shafi'i school followed in Cambodia, generally teach.",
    "Scope: everyday worship and conduct — belief, purification and wudu, the prayer, fasting, zakat, du'a, halal food, halal trade and money, good character.",
    `If the question concerns divorce (talaq), inheritance shares or disputes, sectarian or doctrinal disputes between groups, declaring anyone a disbeliever, a person's specific family or legal dispute, or anything that needs a scholar's personal judgement, reply with exactly ${REFER_MARKER} and nothing else.`,
    "Sources: cite the Quran as Surah name and number:ayah, and hadith with the collection and its sunnah.com number — ONLY when you are certain of the reference. Never invent or guess a reference; if unsure, say the teaching without a number. Never quote Arabic you are not certain of.",
    "Where the schools differ, say so briefly, give the Shafi'i position first, and do not take sides against anyone.",
    "Tone: gentle, humble, encouraging; never harsh, never political. No Markdown (no **, #, tables); short paragraphs or simple • bullets; at most about 180 words.",
    `Terms to use: ${G.GLOSSARY_FOR_AI}.`,
    `Answer in ${locale === "km" ? "Khmer (ភាសាខ្មែរ)" : "English"} unless the user clearly writes in another language.`,
    "Do not add a disclaimer yourself — the app adds it.",
  ].join("\n")
}

/** The model's answer as the person sees it: the referral when it asked for one or strayed into a boundary topic. */
export function finishFiqhAnswer(answer: string | null, locale: "km" | "en"): { kind: "answer" | "referral"; text: string } | null {
  if (answer === null) return null
  const text = answer.trim()
  if (!text) return null
  if (text.includes(REFER_MARKER) || fiqhBoundary(text)) return { kind: "referral", text: withDisclaimer(FIQH_REFERRAL[locale], locale) }
  return { kind: "answer", text: withDisclaimer(text, locale) }
}

export const withDisclaimer = (text: string, locale: "km" | "en") => `${text.trim()}\n\n${FIQH_DISCLAIMER[locale]}`
