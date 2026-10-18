/**
 * The @LuyChlatIslamic quiz (founder, 18/10/2026): a native Telegram quiz poll (sendPoll, type "quiz") on Zakat,
 * halal trade and money ethics — four answers, one correct, an explanation shown after answering, and the exact
 * source of every fact (Surah:Ayah, or the hadith with its sunnah.com numbering). Previewed to the founder and
 * posted only on ✅ / 🚀 like every channel post. The wording is to be reviewed with a local Imam (as the halal
 * lessons, lib/islamic-tips.ts). Telegram's limits: question ≤ 300, each answer ≤ 100, explanation ≤ 200
 * characters (islamic-quiz.test.ts). Pure.
 */
import * as G from "@/lib/islamic/glossary"

export type IslamicQuiz = {
  id: string
  question: string
  options: [string, string, string, string]
  /** Index of the correct answer in `options`. */
  correct: 0 | 1 | 2 | 3
  /** Shown by Telegram after the person answers (≤ 200 characters). */
  explanation: string
  source: { label: string; url: string }
}

const quran = (surah: string, s: number, a: number) => ({ label: `${surah} ${s}:${a}`, url: `https://quran.com/${s}/${a}` })

export const ISLAMIC_QUIZZES: IslamicQuiz[] = [
  {
    id: "zakat-rate",
    question: "ហ្សាកាត់លើប្រាក់សន្សំ (មាស ប្រាក់ ឬលុយ) ដែលគ្រប់នីសាប និងគ្រប់មួយឆ្នាំចន្ទគតិ ត្រូវចេញប៉ុន្មានភាគរយ?",
    options: ["១%", "២,៥%", "៥%", "១០%"],
    correct: 1,
    explanation: "២,៥% (មួយភាគបួននៃមួយភាគដប់) នៃទ្រព្យដែលគ្រប់នីសាប។ ប្រភព៖ Sahih al-Bukhari 1454",
    source: { label: "Sahih al-Bukhari 1454", url: "https://sunnah.com/bukhari:1454" },
  },
  {
    id: "zakat-hawl",
    question: "ទ្រព្យដែលគ្រប់នីសាប ត្រូវកាន់ទុករយៈពេលប៉ុន្មាន ទើបត្រូវចេញហ្សាកាត់?",
    options: ["មួយខែ", "ប្រាំមួយខែ", "មួយឆ្នាំចន្ទគតិ (ហាវល៍)", "ពីរឆ្នាំ"],
    correct: 2,
    explanation: "គ្មានហ្សាកាត់លើទ្រព្យ រហូតដល់គ្រប់មួយឆ្នាំចន្ទគតិ (ហាវល៍)។ ប្រភព៖ Sunan Abi Dawud 1573",
    source: { label: "Sunan Abi Dawud 1573", url: "https://sunnah.com/abudawud:1573" },
  },
  {
    id: "zakat-nisab-gold",
    question: "នីសាបមាស (កម្រិតអប្បបរមាដែលត្រូវចេញហ្សាកាត់) គឺ ២០ ឌីណារ។ តើស្មើនឹងមាសប្រហែលប៉ុន្មានក្រាម?",
    options: ["២០ ក្រាម", "៥០ ក្រាម", "៨៥ ក្រាម", "២០០ ក្រាម"],
    correct: 2,
    explanation: "២០ ឌីណារ ≈ មាស ៨៥ ក្រាម (តាមការគណនាទូទៅ)។ ប្រភព៖ Sunan Abi Dawud 1573",
    source: { label: "Sunan Abi Dawud 1573", url: "https://sunnah.com/abudawud:1573" },
  },
  {
    id: "riba",
    question: "តាមគម្ពីរគួរអាន តើអល់ឡោះអនុញ្ញាតអ្វី និងហាមឃាត់អ្វី?",
    options: ["អនុញ្ញាតការប្រាក់ ហាមការជួញដូរ", "អនុញ្ញាតការជួញដូរ ហាមការប្រាក់ (រីបា)", "ហាមទាំងពីរ", "អនុញ្ញាតទាំងពីរ"],
    correct: 1,
    explanation: "«អល់ឡោះអនុញ្ញាតការជួញដូរ ហើយហាមឃាត់ការប្រាក់»។ ប្រភព៖ Al-Baqarah 2:275",
    source: quran("Al-Baqarah", 2, 275),
  },
  {
    id: "write-debts",
    question: "ពេលខ្ចី ឬឱ្យខ្ចីលុយមានកំណត់ថ្ងៃសង តើគម្ពីរគួរអានបង្គាប់ឱ្យធ្វើអ្វី?",
    options: ["ទុកចិត្តគ្នា មិនបាច់កត់", "កត់ត្រាជាលាយលក្ខណ៍អក្សរ មានសាក្សី", "និយាយប្រាប់គ្រួសារ", "ស្បថ"],
    correct: 1,
    explanation: "ចូរកត់ត្រាបំណុលដែលមានកំណត់ថ្ងៃសង ហើយមានសាក្សី។ ប្រភព៖ Al-Baqarah 2:282",
    source: quran("Al-Baqarah", 2, 282),
  },
  {
    id: "debtor-hardship",
    question: "បើអ្នកជំពាក់យើង កំពុងជួបការលំបាកមិនអាចសងបាន តើគម្ពីរគួរអានណែនាំឱ្យធ្វើដូចម្ដេច?",
    options: ["ដាក់ការប្រាក់បន្ថែម", "ផ្ដល់ពេលរហូតដល់គាត់មានលទ្ធភាព", "ប្ដឹងភ្លាម", "យកទ្រព្យគាត់"],
    correct: 1,
    explanation: "ចូរផ្ដល់ពេលដល់គាត់ រហូតដល់មានលទ្ធភាព ហើយការលើកលែងជាសាដាកះ ល្អជាង។ ប្រភព៖ Al-Baqarah 2:280",
    source: quran("Al-Baqarah", 2, 280),
  },
  {
    id: "honest-merchant",
    question: "ឈ្មួញស្មោះត្រង់ និងទុកចិត្តបាន នឹងនៅជាមួយនរណានៅថ្ងៃបរលោក?",
    options: ["ជាមួយស្ដេច", "ជាមួយព្យាការី អ្នកស្មោះត្រង់ និងអ្នកពលី", "ជាមួយអ្នកមាន", "គ្មានចម្លើយ"],
    correct: 1,
    explanation: "ឈ្មួញស្មោះត្រង់ ទុកចិត្តបាន នៅជាមួយព្យាការី អ្នកស្មោះត្រង់ និងអ្នកពលី។ ប្រភព៖ Jami' at-Tirmidhi 1209",
    source: { label: "Jami' at-Tirmidhi 1209", url: "https://sunnah.com/tirmidhi:1209" },
  },
  {
    id: "no-cheating",
    question: "ការលាក់ទំនិញខូចនៅខាងក្រោម ហើយដាក់ទំនិញល្អនៅលើ (បោកបញ្ឆោតអ្នកទិញ) មានហាទីសថាដូចម្ដេច?",
    options: ["ជាល្បិចជំនួញធម្មតា", "អ្នកបោកបញ្ឆោត មិនមែនជាពួកយើងទេ", "អាចធ្វើបានបើលក់ថោក", "គ្មានបញ្ហា"],
    correct: 1,
    explanation: "«អ្នកណាបោកបញ្ឆោត អ្នកនោះមិនមែនពួកយើងទេ» — ព្យាការីមានប្រសាសន៍ ពេលឃើញគំនរអាហារសើមនៅខាងក្រោម។ ប្រភព៖ Sahih Muslim 102",
    source: { label: "Sahih Muslim 102", url: "https://sunnah.com/muslim:102" },
  },
  {
    id: "own-hands",
    question: "តើអាហារបែបណាដែលល្អបំផុត តាមហាទីស?",
    options: ["អាហារដែលទទួលបានដោយមិនបាច់ធ្វើការ", "អាហារដែលបានមកពីកម្លាំងដៃខ្លួនឯង", "អាហារថ្លៃបំផុត", "អាហារពីការខ្ចី"],
    correct: 1,
    explanation: "គ្មានអាហារណាល្អជាងអាហារពីកម្លាំងដៃខ្លួនឯងទេ — ព្យាការីដាវូដក៏ហូបពីការងារដៃខ្លួនឯង។ ប្រភព៖ Sahih al-Bukhari 2072",
    source: { label: "Sahih al-Bukhari 2072", url: "https://sunnah.com/bukhari:2072" },
  },
  {
    id: "no-waste",
    question: "គម្ពីរគួរអានមានបន្ទូលអំពីការហូប និងការផឹកដូចម្ដេច?",
    options: ["ហូបឱ្យច្រើនបំផុត", "ហូប និងផឹក តែកុំខ្ជះខ្ជាយ", "កុំហូបពេលយប់", "ហូបតែម្ដងក្នុងមួយថ្ងៃ"],
    correct: 1,
    explanation: "«ចូរហូប និងផឹក ប៉ុន្តែកុំខ្ជះខ្ជាយ — ទ្រង់មិនស្រឡាញ់អ្នកខ្ជះខ្ជាយទេ»។ ប្រភព៖ Al-A'raf 7:31",
    source: quran("Al-A'raf", 7, 31),
  },
  {
    id: "sadaqah",
    question: "ការធ្វើទាន (សាដាកះ) ធ្វើឱ្យទ្រព្យសម្បត្តិរបស់យើងយ៉ាងដូចម្ដេច?",
    options: ["ធ្វើឱ្យទ្រព្យថយចុះ", "មិនធ្វើឱ្យទ្រព្យថយចុះទេ", "ធ្វើឱ្យក្ស័យធន", "គ្មានឥទ្ធិពល ហើយគ្មានផលបុណ្យ"],
    correct: 1,
    explanation: `«សាដាកះមិនធ្វើឱ្យទ្រព្យថយចុះទេ» — តែនាំមក${G.BARAKAH}។ ប្រភព៖ Sahih Muslim 2588`,
    source: { label: "Sahih Muslim 2588", url: "https://sunnah.com/muslim:2588" },
  },
  {
    id: "mon-thu",
    question: `ហេតុអ្វី${G.PROPHET_FULL} តែងបួសថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍?`,
    options: ["ព្រោះជាថ្ងៃបុណ្យ", "ព្រោះអំពើត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ", "ព្រោះជាថ្ងៃផ្សារ", "ព្រោះជាថ្ងៃឈប់សម្រាក"],
    correct: 1,
    explanation: "អំពើត្រូវបានបង្ហាញនៅថ្ងៃច័ន្ទ និងព្រហស្បតិ៍ ហើយលោកចង់ឱ្យអំពើលោកត្រូវបង្ហាញ ពេលលោកកំពុងបួស។ ប្រភព៖ Jami' at-Tirmidhi 747",
    source: { label: "Jami' at-Tirmidhi 747", url: "https://sunnah.com/tirmidhi:747" },
  },
]

/** The quiz for a day (the same for everyone; consecutive quiz days walk through the bank). */
export function quizOfDay(day: string): IslamicQuiz {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
  return ISLAMIC_QUIZZES[((n % ISLAMIC_QUIZZES.length) + ISLAMIC_QUIZZES.length) % ISLAMIC_QUIZZES.length]
}

const LETTERS = ["ក", "ខ", "គ", "ឃ"]

/** The founder's preview (plain text): the question, the answers with ✅ on the correct one, the explanation. */
export function quizPreviewText(q: IslamicQuiz): string {
  return [
    "🧠 សំណួរ Quiz ប្រចាំសប្ដាហ៍",
    "",
    q.question,
    ...q.options.map((o, i) => `${i === q.correct ? "✅" : "▫️"} ${LETTERS[i]}. ${o}`),
    "",
    `💡 ${q.explanation}`,
    `📖 ${q.source.url}`,
  ].join("\n")
}

/** sendPoll's body for the channel: an anonymous quiz (channel polls are anonymous). */
export function quizPollBody(chatId: string, q: IslamicQuiz) {
  return {
    chat_id: chatId,
    question: `🧠 ${q.question}`,
    options: q.options.map((text) => ({ text })),
    type: "quiz",
    correct_option_id: q.correct,
    explanation: q.explanation,
    is_anonymous: true,
  }
}
