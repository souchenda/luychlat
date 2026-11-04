import { GUIDE, type Bilingual } from "@/lib/guide/content"

/**
 * The helpline's approved knowledge (founder, 4/11/2026 — Cellcard / AirAsia-style chat): the user guide's own questions
 * and answers (one source — a fact is never written twice), plus a few the guide doesn't cover, each checked against the
 * app. The chat answers ONLY from here; what it can't match goes to a person (the founder, on Telegram). Pure
 * (knowledge.test.ts). Never the person's money data.
 */
export type HelpAction = "upgrade" | "human" | { href: string; label: Bilingual }
export type HelpEntry = { id: string; q: Bilingual; a: Bilingual[]; keywords: string[]; action?: HelpAction }

/** Words that point to an entry, Khmer and English, matched inside the question (Khmer has no spaces). */
const KEYWORDS: Record<string, string[]> = {
  "start-0": ["ដកលុយ", "withdraw", "ធនាគារ", "e-wallet"],
  "start-1": ["បង្កើតកាបូប", "បន្ថែមកាបូប", "add wallet", "គណនីធនាគារ", "bank account"],
  "start-2": ["មិនត្រូវ", "doesn't match", "not match", "សមតុល្យខុស", "balance wrong"],
  "start-3": ["ដុល្លារ", "រៀល", "dollar", "riel", "currency", "រូបិយប័ណ្ណ"],
  "start-4": ["អាជីវកម្ម", "គ្រួសារ", "business", "family", "personal", "ផ្ទាល់ខ្លួន"],
  "tracking-0": ["កត់ត្រា", "record", "ចំណាយ", "ចំណូល", "expense", "income"],
  "tracking-3": ["លុប", "កែ", "delete", "edit"],
  "plans-0": ["free", "pro", "ខុសគ្នា", "difference", "តម្លៃ", "price", "ថ្លៃប៉ុន្មាន", "how much"],
  "plans-1": ["ដំឡើង pro", "ជាវ", "upgrade", "subscribe", "បង់ប្រាក់", "pay for"],
  "plans-2": ["ណែនាំមិត្ត", "refer", "លេខកូដ"],
  "safety-0": ["បាត់ទូរសព្ទ", "បាត់ទូរស័ព្ទ", "ទូរសព្ទខូច", "lost phone", "broken phone", "ប្តូរទូរស័ព្ទ"],
  "safety-1": ["សុវត្ថិភាព", "safe", "security", "privacy", "ឯកជន"],
  "safety-4": ["ជំនួយ", "help", "support"],
}

const EXTRA: HelpEntry[] = [
  {
    id: "ultra",
    q: { km: "ULTRA ជាអ្វី?", en: "What is ULTRA?" },
    a: [
      { km: "ULTRA ($6.99/ខែ ឬ $59.99/ឆ្នាំ)៖ អ្វីៗទាំងអស់ក្នុង PRO និងគណនីអាជីវកម្មច្រើនគ្មានកំណត់ — សម្រាប់អ្នកមានហាង ឬមុខរបរច្រើន។", en: "ULTRA ($6.99/month or $59.99/year): everything in PRO plus unlimited Business workspaces — for owners with several shops or businesses." },
    ],
    keywords: ["ultra", "អាជីវកម្មច្រើន", "ហាងច្រើន", "several business"],
    action: "upgrade",
  },
  {
    id: "forgot",
    q: { km: "ភ្លេចពាក្យសម្ងាត់ ឬចូលគណនីមិនបាន", en: "I forgot my password / can't sign in" },
    a: [
      { km: "នៅទំព័រចូលគណនី ចុច «ភ្លេចពាក្យសម្ងាត់?»។ គណនីអ៊ីមែលទទួលបានតំណកំណត់ពាក្យសម្ងាត់ថ្មី។ គណនីលេខទូរស័ព្ទដែលបានភ្ជាប់ Telegram ទទួលកូដ 6 ខ្ទង់ពី @luychlat_bot (ផុតកំណត់ក្នុង 10 នាទី)។", en: "On the sign-in page tap «Forgot password?». Email accounts get a link to set a new password. Phone accounts linked to Telegram get a 6-digit code from @luychlat_bot (valid 10 minutes)." },
      { km: "បានភ្ជាប់ Telegram ហើយ? ចុច «ចូលរហ័សជាមួយ Telegram» ក៏ចូលបានដែរ។", en: "Linked to Telegram? «Sign in with Telegram» works too." },
    ],
    keywords: ["ភ្លេច", "ពាក្យសម្ងាត់", "លេខសម្ងាត់", "password", "forgot", "ចូលមិនបាន", "can't sign in", "cannot login", "login"],
  },
  {
    id: "telegram",
    q: { km: "ភ្ជាប់ Telegram bot យ៉ាងដូចម្តេច?", en: "How do I link the Telegram bot?" },
    a: [
      { km: "«ការកំណត់» › «Telegram bot» › ចុចភ្ជាប់ — រួចកត់ត្រាចំណាយដោយសរសេរ ឬនិយាយទៅ @luychlat_bot ឧ. «កាហ្វេ 2 ដុល្លារ»។", en: "Settings › Telegram bot › Link — then record by typing or speaking to @luychlat_bot, e.g. «coffee 2 dollars»." },
    ],
    keywords: ["telegram", "តេឡេក្រាម", "bot", "ប៊ត"],
    action: { href: "/settings", label: { km: "បើកការកំណត់", en: "Open Settings" } },
  },
]

export const KNOWLEDGE: HelpEntry[] = [
  ...GUIDE.flatMap((section) =>
    section.items.map((item, i) => {
      const id = `${section.id}-${i}`
      return { id, q: item.q, a: item.a, keywords: KEYWORDS[id] ?? [], action: section.id === "plans" && i <= 1 ? ("upgrade" as const) : undefined }
    }),
  ),
  ...EXTRA,
]

/** The chips under the greeting: the questions people ask most. */
export const QUICK_IDS = ["plans-0", "forgot", "start-0", "telegram", "safety-0", "ultra"]

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * The best entry for a free-text question, or null below the bar — never a guess: a keyword (longer counts more) or the
 * entry's own question word for word. Ties go to the earlier entry.
 */
export function bestAnswer(text: string): HelpEntry | null {
  const t = norm(text)
  if (t.length < 2) return null
  let best: { entry: HelpEntry; score: number } | null = null
  for (const entry of KNOWLEDGE) {
    let score = 0
    for (const k of entry.keywords) if (t.includes(norm(k))) score += Math.min(3, Math.ceil(norm(k).length / 4))
    if (t === norm(entry.q.km) || t === norm(entry.q.en)) score += 10
    if (score > (best?.score ?? 0)) best = { entry, score }
  }
  return best && best.score >= 2 ? best.entry : null
}

/** «Talk to a person»: asked for in so many words. */
export const wantsHuman = (text: string) => /មនុស្ស|ភ្នាក់ងារ|និយាយជាមួយ|human|agent|real person|operator|staff/i.test(text)

/**
 * A person answers Monday to Friday, 08:00–17:00 Cambodian time (founder, 4/11/2026 — corrected from 24/7). Outside those
 * hours a handoff still reaches his Telegram (he answers if he is free); the customer is told a person replies in working
 * hours.
 */
export function staffHours(now: number): boolean {
  const at = new Date(now + 7 * 3_600_000)
  const day = at.getUTCDay()
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes()
  return day >= 1 && day <= 5 && minutes >= 8 * 60 && minutes < 17 * 60
}

/**
 * What a typed message is (founder, 4/11/2026: «every question must stay within the person's use of the app, their money
 * and their business; off the subject, answer with the greatest respect, as one team, never harming the app's name»):
 *   answer     an approved answer exists
 *   greeting / thanks   a courteous word back
 *   advice     buy / sell / invest advice — we are not licensed financial advisers: said kindly, never advised
 *   ontopic    about the app, money or business, but no approved answer → offered to the team (a person)
 *   offtopic   anything else → a respectful, warm «we can only help with …», never sent to the team
 * A person asked for in so many words is handled before this (wantsHuman).
 */
export type HelpKind = "answer" | "greeting" | "thanks" | "advice" | "ontopic" | "offtopic"

const ON_TOPIC =
  /អេប|លុយ|ប្រាក់|កាបូប|ធនាគារ|ចំណាយ|ចំណូល|វិក្កយបត្រ|បំណុល|កម្ចី|សន្សំ|ថវិកា|គោលដៅ|របាយការណ៍|គណនី|ពាក្យសម្ងាត់|លេខសម្ងាត់|ទិន្នន័យ|ហាង|អាជីវកម្ម|លក់|អតិថិជន|ពន្ធ|បង់|ផ្ទេរ|កត់ត្រា|ស្លីប|សំឡេង|កំហុស|គាំង|ដំឡើង|ជាវ|app|money|wallet|bank|expense|income|bill|debt|loan|saving|budget|goal|report|account|password|login|sign|data|shop|business|sale|customer|tax|pay|transfer|record|slip|receipt|error|bug|crash|install|update|subscri|pro\b|ultra|khqr|soundbox|telegram|bot\b|aba|acleda|wing/i
const ADVICE = /គួរទិញ|គួរលក់|គួរវិនិយោគ|វិនិយោគអ្វី|ភាគហ៊ុន|គ្រីបតូ|bitcoin|crypto|should i (buy|sell|invest)|which stock|invest in/i
const GREETING = /^(សួស្តី|ជម្រាបសួរ|សួរស្តី|hello|hi|hey|good (morning|afternoon|evening))[\s!.?]*$/i
const THANKS = /អរគុណ|thank|thanks|thx/i

export function classify(text: string): { kind: HelpKind; entry?: HelpEntry } {
  const t = text.trim()
  if (GREETING.test(t)) return { kind: "greeting" }
  if (ADVICE.test(t)) return { kind: "advice" }
  const entry = bestAnswer(t)
  if (entry) return { kind: "answer", entry }
  if (THANKS.test(t) && t.length <= 40) return { kind: "thanks" }
  return { kind: ON_TOPIC.test(t) ? "ontopic" : "offtopic" }
}

/** The courteous replies, in the team's voice («យើង», «លោកអ្នក»), never a lecture, never a joke at anyone's expense. */
export const KIND_REPLY: Record<"greeting" | "thanks" | "advice" | "offtopic", Bilingual> = {
  greeting: {
    km: "ជម្រាបសួរ! ក្រុមការងារ អេប លុយឆ្លាត រីករាយបម្រើលោកអ្នក។ តើមានអ្វីឱ្យយើងជួយអំពីការប្រើអេប ការគ្រប់គ្រងលុយ ឬអាជីវកម្មរបស់លោកអ្នកទេ?",
    en: "Hello! The App Luy Chlat team is glad to help. What can we do for you about the app, your money or your business?",
  },
  thanks: {
    km: "អរគុណច្រើនដែរ! បើលោកអ្នកមានចម្ងល់ផ្សេងទៀត ក្រុមការងារយើងនៅទីនេះជានិច្ច។",
    en: "Thank you too! If you have any other question, our team is always here.",
  },
  advice: {
    km: "សូមអភ័យទោស ក្រុមការងារ អេប លុយឆ្លាត មិនមែនជាអ្នកប្រឹក្សាហិរញ្ញវត្ថុដែលមានអាជ្ញាប័ណ្ណទេ ដូច្នេះយើងមិនអាចណែនាំឱ្យទិញ លក់ ឬវិនិយោគលើអ្វីមួយបានទេ។ ប៉ុន្តែអេបអាចជួយលោកអ្នកកត់ត្រា និងតាមដានទ្រព្យសម្បត្តិ (មាស ភាគហ៊ុន…) ដើម្បីសម្រេចចិត្តដោយខ្លួនឯងបានច្បាស់ជាងមុន។",
    en: "We're sorry: the App Luy Chlat team are not licensed financial advisers, so we can't advise buying, selling or investing in anything. The app can help you record and follow your assets (gold, shares…) so you can decide with a clearer picture.",
  },
  offtopic: {
    km: "សូមអភ័យទោស ក្រុមការងារ អេប លុយឆ្លាត អាចជួយបានតែលើចម្ងល់ពាក់ព័ន្ធនឹងការប្រើប្រាស់អេប ការគ្រប់គ្រងលុយ និងអាជីវកម្មរបស់លោកអ្នកប៉ុណ្ណោះ។ អរគុណចំពោះការយោគយល់ — តើមានអ្វីទាក់ទងនឹងអេបដែលយើងអាចជួយលោកអ្នកបានទេ?",
    en: "We're sorry: the App Luy Chlat team can only help with questions about using the app, managing your money and your business. Thank you for understanding. Is there anything about the app we can help you with?",
  },
}
