/**
 * «ធ្លាប់ទេ?» — a weekly series for @LuyChlatCommunity and the Facebook Page (founder, 29/10/2026: «a pain people knew
 * before, and App Luy Chlat has the answer»). Each post asks about a real everyday money pain, then shows what the app
 * does about it — only features the app really has. Wednesday 18:30, one a week, twelve in turn (about three months).
 * Drawn on the approved tip poster (lib/server/tip-poster.ts, v3 — the question as the headline, the answer as the gold
 * takeaway); previewed to the founder and published only on ✅ / 🚀 (scheduled_posts, kind FAMILIAR).
 * Pure (familiar.test.ts); the wording guard (tests/golden/content-guards.test.ts) covers every line.
 */

export type Familiar = {
  id: string
  /** The pain, as a question the reader recognises. */
  question: string
  /** What the app does about it — one sentence, the poster's gold takeaway. */
  answer: string
  /** One more sentence of how (the poster's body and the caption). */
  how: string
}

export const FAMILIAR: Familiar[] = [
  {
    id: "month-end",
    question: "ដល់ចុងខែ លុយអស់ ហើយមិនដឹងថាចាយទៅណាខ្លះ?",
    how: "ចាយអ្វី កត់ភ្លាម — ចុចពីរបីដង ជ្រើសប្រភេទ ម្ហូប សាំង ផ្សារ។",
    answer: "ដល់ចុងខែ របាយការណ៍ប្រាប់ច្បាស់ថាលុយទៅណាខ្លះ។",
  },
  {
    id: "lent-family",
    question: "ឲ្យសាច់ញាតិខ្ចីលុយ ហើយភ្លេចថាប៉ុន្មាន ថ្ងៃណា?",
    how: "កត់ឈ្មោះ ចំនួន និងថ្ងៃសង ទុកក្នុងបញ្ជីបំណុល។",
    answer: "អេបរំលឹកជំនួសអ្នក មិនបាច់ខ្មាស់សួរ។",
  },
  {
    id: "loan-date",
    question: "ភ្លេចថ្ងៃបង់រំលស់ធនាគារ ត្រូវពិន័យ ហើយខូចប្រវត្តិ CBC?",
    how: "ថតតារាងបង់ប្រាក់របស់ធនាគារ អេបកត់ទុកគ្រប់ខែ។",
    answer: "អេបរំលឹកមុនថ្ងៃបង់ ការពារឈ្មោះល្អរបស់អ្នក។",
  },
  {
    id: "bills",
    question: "ភ្លេចបង់ថ្លៃភ្លើង ទឹក អ៊ីនធឺណិត រហូតគេផ្តាច់?",
    how: "បញ្ចូលវិក្កយបត្រប្រចាំខែ និងថ្ងៃកំណត់ម្តង។",
    answer: "អេបរំលឹកមុនថ្ងៃកំណត់ រាល់ខែ។",
  },
  {
    id: "shop-home",
    question: "ដកលុយហាងចាយក្នុងផ្ទះ មិនដឹងហាងចំណេញប៉ុន្មាន?",
    how: "ហាង និងផ្ទះ ជាគណនីដាច់ពីគ្នា។ យកលុយហាងទៅប្រើ កត់ជា «ម្ចាស់ដកប្រើ»។",
    answer: "ឃើញប្រាក់ចំណេញពិតរបស់ហាង។",
  },
  {
    id: "khqr",
    question: "ភ្ញៀវថាស្កេន KHQR ហើយ តែលុយចូលឬអត់?",
    how: "SoundBox ស្តាប់លុយចូលគណនីធនាគាររបស់អ្នក (PRO)។",
    answer: "ទូរសព្ទប្រកាសជាសំឡេងខ្មែរ «ទទួលបាន 25,000 រៀល»។",
  },
  {
    id: "many-banks",
    question: "លុយនៅច្រើនធនាគារ មិនដឹងសរុបមានប៉ុន្មាន?",
    how: "កាបូបនីមួយៗសម្រាប់ ABA ACLEDA Wing និងលុយសុទ្ធ។",
    answer: "ឃើញសរុបនៅកន្លែងតែមួយ ហើយលាក់លេខពេលបើកអេប។",
  },
  {
    id: "customers-owe",
    question: "ភ្ញៀវជំពាក់ច្រើន ចាំមិនអស់អ្នកណាប៉ុន្មាន?",
    how: "បញ្ជីអ្នកជំពាក់ (AR) និងបញ្ជីយើងជំពាក់គេ (AP)។",
    answer: "ដឹងច្បាស់ ប៉ុន្មាន ដល់ថ្ងៃណា។",
  },
  {
    id: "savings",
    question: "ចង់សន្សំទិញម៉ូតូ តែសន្សំមិនដែលបាន?",
    how: "ដាក់ឈ្មោះគោលដៅ ម៉ូតូ ឬថ្លៃសាលាកូន និងចំនួនដែលត្រូវការ។",
    answer: "ឃើញវាកើនឡើងបន្តិចម្តងៗ រហូតដល់គោលដៅ។",
  },
  {
    id: "invoice",
    question: "សរសេរវិក្កយបត្រដោយដៃ ភ្ញៀវថាមិនទាន់ទទួល?",
    how: "ចេញវិក្កយបត្រមាន KHQR របស់ហាង។",
    answer: "ផ្ញើជារូបភាពភ្លាម អតិថិជនស្កេនបង់បានតែម្តង។",
  },
  {
    id: "car-papers",
    question: "ពន្ធផ្លូវ ឬត្រួតពិនិត្យឡាន ផុតកំណត់មិនដឹងខ្លួន?",
    how: "កត់ថ្ងៃផុតកំណត់នៃឯកសារយានយន្តម្តង។",
    answer: "អេបរំលឹកមុន 30, 15 និង 7 ថ្ងៃ។",
  },
  {
    id: "lost-phone",
    question: "បាត់ទូរសព្ទ បារម្ភគេមើលឃើញលុយរបស់អ្នក?",
    how: "ពីទូរសព្ទផ្សេង ចុច «ទូរសព្ទខ្ញុំបាត់»។",
    answer: "ទូរសព្ទដែលបាត់ ត្រូវចាកចេញភ្លាម ហើយទិន្នន័យនៅសុវត្ថិភាព។",
  },
]

/** Wednesday 18:30 — between Tuesday's and Friday's dilemma; Wednesday's 20:00 check-in comes 90 minutes later. */
export const FAMILIAR_WEEKDAY = 3
export const FAMILIAR_MINUTE = 18 * 60 + 30

/** The series starts on Wednesday 4 November 2026 with the first one, then one a week in turn. */
export const FAMILIAR_START = "2026-11-04"

export function familiarOfDay(day: string): Familiar {
  const weeks = Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${FAMILIAR_START}T00:00:00Z`)) / (7 * 86_400_000))
  return FAMILIAR[((weeks % FAMILIAR.length) + FAMILIAR.length) % FAMILIAR.length]
}

/** The poster (the approved tip frame): the tag «ធ្លាប់ទេ?», the question as the headline; «how», then the answer in gold. */
export const familiarPoster = (f: Familiar) => ({ title: f.question, body: `${f.how} ${f.answer}` })
export const FAMILIAR_TAG = "ធ្លាប់ទេ?"

/** The caption: the question, the answer, how, and the call to the app — never a promise the app cannot keep. */
export function familiarPostText(f: Familiar): string {
  return [`🤔 ធ្លាប់ទេ? ${f.question}`, "", `✅ ${f.answer}`, f.how, "", "📒 អេប លុយឆ្លាត — សៀវភៅកត់លុយក្នុងទូរសព្ទ ឥតគិតថ្លៃ", "👉 app.luychlat.com"].join("\n")
}
