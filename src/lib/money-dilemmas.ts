/**
 * «Money dilemmas» for the Facebook Page and @LuyChlatCommunity (founder, 18/10/2026): a real Cambodian money
 * situation and an open question, to start a conversation (comment, share, tag a friend) — then the call to the
 * app. Not advice: there is no right answer, people tell what they would do. Previewed to the founder and
 * published only on ✅ / 🚀 (scheduled_posts, kind DILEMMA). Amounts are illustrative and exact as written.
 * Pure (money-dilemmas.test.ts); the wording guard (tests/golden/content-guards.test.ts) covers every line.
 */

/**
 * EXPERIMENTAL — OFF (founder, 20/10/2026: the canvas-drawn poster was rejected as a «developer wireframe»): no
 * dilemma poster is attached to a card or a post until a high-fidelity template designed to docs/BRAND_DESIGN_SYSTEM.md
 * replaces lib/server/dilemma-poster.ts. Turning this on is the founder's decision.
 */
export const DILEMMA_POSTERS_ENABLED = false

/** The poster's two choices side by side (experimental, see DILEMMA_POSTERS_ENABLED): no parentheses on the graphic. */
export type DilemmaChoice = { title: string; sub: string; icon: "card" | "shield"; tone: "warm" | "calm" }
export type DilemmaPoster = { headline: string; a: DilemmaChoice; b: DilemmaChoice; prompt: string }
export type MoneyDilemma = { id: string; title: string; story: string; question: string; poster?: DilemmaPoster }

/** The call to the app — «DTI» explained in plain Khmer (founder, 20/10/2026: the bare word confused people). */
export const DILEMMA_CTA = [
  "📊 ចង់ដឹងសុខភាពហិរញ្ញវត្ថុ និងគណនាបន្ទុកបំណុលធៀបនឹងចំណូល (DTI) របស់អ្នក?",
  "(DTI គឺជារង្វាស់ថាតើបងចំណាយប៉ុន្មាន % នៃចំណូលប្រចាំខែទៅលើបំណុល)",
  "👉 គណនាឥតគិតថ្លៃលើ អេប លុយឆ្លាត៖ app.luychlat.com",
].join("\n")

export const MONEY_DILEMMAS: MoneyDilemma[] = [
  {
    id: "sibling-loan",
    title: "ប្អូនសុំខ្ចីលុយម្ដងទៀត",
    story: "ប្អូនប្រុសសុំខ្ចីលុយ $៥០០ ទៅទិញម៉ូតូរត់ការងារ ហើយសន្យាថាសងវិញក្នុង ៣ ខែ។ ប៉ុន្តែលុយ $២០០ ដែលខ្ចីកាលពីឆ្នាំមុន គាត់មិនទាន់សងនៅឡើយទេ។",
    question: "បើជាបង តើបងឱ្យខ្ចី បដិសេធ ឬឱ្យខ្ចីតែពាក់កណ្ដាល?",
  },
  {
    id: "couple-budget",
    title: "លុយប្ដីប្រពន្ធ៖ ដាក់រួម ឬចែកគ្នា?",
    story: "ប្ដីប្រពន្ធរកលុយបានសរុប $៩០០ ក្នុងមួយខែ។ ប្ដីចង់ដាក់លុយរួមកន្លែងតែមួយ ចំណែកប្រពន្ធចង់ឱ្យម្នាក់កាន់ម្នាក់ ហើយចែកចំណាយផ្ទះពាក់កណ្ដាល។",
    question: "គ្រួសារបង ចាត់ចែងលុយបែបណា? ហេតុអ្វី?",
  },
  {
    id: "phone-installment",
    title: "ទូរស័ព្ទថ្មី៖ បង់រំលស់ ឬសន្សំទិញ?",
    story: "ទូរស័ព្ទថ្មីតម្លៃ $១.២០០ អាចបង់រំលស់ $៦០ ក្នុងមួយខែ រយៈពេល ២៤ ខែ (សរុប $១.៤៤០)។ ប្រាក់ខែរបស់បង $៤៥០។",
    question: "បងនឹងទិញបង់រំលស់ សន្សំទិញលុយសុទ្ធ ឬប្រើទូរស័ព្ទចាស់បន្តសិន?",
  },
  {
    id: "shop-credit",
    title: "លក់ដាច់ តែលុយមិនដល់ដៃ",
    story: "ហាងលក់គ្រឿងទេសលក់ដាច់ល្អ តែអតិថិជនជំពាក់ច្រើននាក់ ធ្វើឱ្យខ្វះលុយទិញស្តុកថ្មី ខណៈអ្នកផ្គត់ផ្គង់ចង់បានលុយសុទ្ធ។",
    question: "បើជាម្ចាស់ហាង បងនឹងឈប់ឱ្យជំពាក់ ខ្ចីធនាគារ ឬបញ្ចុះតម្លៃឱ្យអ្នកបង់លុយសុទ្ធ?",
  },
  {
    id: "tontine",
    title: "លេងតុងទីន ឬសន្សំធនាគារ?",
    story: "មិត្តរួមការងារអញ្ជើញចូលលេងតុងទីន ១០ នាក់ ម្នាក់ $១០០ ក្នុងមួយខែ។ អ្នកដេញការប្រាក់ខ្ពស់ បានលុយមុន។",
    question: "បងចូលលេង ឬដាក់សន្សំក្នុងធនាគារវិញ? ធ្លាប់មានបទពិសោធន៍ល្អ ឬអាក្រក់ទេ?",
  },
  {
    id: "wedding-season",
    title: "រដូវការ៖ ចងដៃ ៤ កន្លែងក្នុងមួយខែ",
    story: "ខែនេះត្រូវទៅចងដៃការ ៤ កន្លែង កន្លែងនីមួយៗ $៣០ ទៅ $៥០ ខណៈប្រាក់ខែ $៤០០ ហើយថ្លៃផ្ទះ និងថ្លៃសាំងនៅដដែល។",
    question: "បងចាត់ចែងយ៉ាងម៉េច? ទៅទាំងអស់ ផ្ញើតែលុយ ឬរៀបចំថវិកាការទុកមុន?",
  },
  {
    id: "debt-or-savings",
    title: "សងបំណុលមុន ឬទុកប្រាក់បម្រុងមុន?",
    story: "បងមានលុយសល់ $១.០០០។ មានបំណុលកាតឥណទាន ការប្រាក់ ១៨% ក្នុងមួយឆ្នាំ ហើយក៏មិនទាន់មានប្រាក់បម្រុងសម្រាប់ពេលអាសន្នសោះ។",
    question: "បើជាបង នឹងសងបំណុលមុន ទុកប្រាក់បម្រុងមុន ឬចែកពាក់កណ្ដាល?",
    poster: {
      headline: "មានលុយសល់ $១,០០០ ក្នុងដៃ...",
      a: { title: "សងកាតឥណទានមុន", sub: "កាត់បន្ថយការប្រាក់ ១៨%/ឆ្នាំ", icon: "card", tone: "warm" },
      b: { title: "ទុកប្រាក់បម្រុងមុន", sub: "ការពារពេលមានអាសន្ន", icon: "shield", tone: "calm" },
      prompt: "តើគួររើសមួយណា? A ឬ B?",
    },
  },
  {
    id: "parents-support",
    title: "ផ្ញើលុយជូនឪពុកម្ដាយ",
    story: "ប្រាក់ខែ $៥០០ ផ្ញើជូនឪពុកម្ដាយនៅស្រុក $១៥០ រៀងរាល់ខែ ជាការដឹងគុណ តែធ្វើឱ្យខ្លួនឯងសន្សំមិនបានសោះ។",
    question: "បងរក្សាការផ្ញើដដែល កាត់បន្ថយបន្តិច ឬរកចំណូលបន្ថែម?",
  },
  {
    id: "gold-fd-business",
    title: "$២.០០០ ទុកធ្វើអ្វីល្អ?",
    story: "បងមានលុយ $២.០០០ ដែលមិនត្រូវប្រើក្នុងរយៈពេល ២ ឆ្នាំខាងមុខ។",
    question: "បងនឹងទិញមាស ដាក់ប្រាក់បញ្ញើមានកាលកំណត់ (FD) ឬពង្រីកមុខរបរ?",
  },
  {
    id: "loan-guarantor",
    title: "មិត្តសុំឱ្យធ្វើជាអ្នកធានាកម្ចី",
    story: "មិត្តជិតស្និទ្ធសុំឱ្យបងចុះហត្ថលេខាធ្វើជាអ្នកធានាកម្ចីធនាគារ $៥.០០០ ដើម្បីបើកហាងកាហ្វេ។",
    question: "បងព្រមធ្វើជាអ្នកធានា ឬបដិសេធដោយសុភាព? ហេតុអ្វី?",
  },
]

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)

/** The dilemma for a posting day (consecutive posting days walk through the bank). */
export function dilemmaOfDay(day: string): MoneyDilemma {
  const n = MONEY_DILEMMAS.length
  return MONEY_DILEMMAS[((dayNumber(day) % n) + n) % n]
}

/** The post — the same text on the Telegram channel and the Facebook Page (plain text, no italics). */
export function dilemmaPostText(d: MoneyDilemma): string {
  return [
    `🤔 ${d.title}`,
    "",
    d.story,
    "",
    `❓ ${d.question}`,
    "",
    "💬 សរសេរ comment ប្រាប់គំនិតរបស់បង ឬ Tag មិត្តដែលធ្លាប់ជួបរឿងនេះ — Share ឱ្យអ្នកដែលត្រូវការ!",
    "",
    DILEMMA_CTA,
  ].join("\n")
}

/** Tuesday and Friday at 18:30 — the evening scroll. */
export const DILEMMA_MINUTE = 18 * 60 + 30
export const DILEMMA_WEEKDAYS = [2, 5]
