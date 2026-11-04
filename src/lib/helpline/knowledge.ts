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
