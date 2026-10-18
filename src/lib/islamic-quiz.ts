/**
 * «ល្បងប្រាជ្ញាច្បាប់សាសនា (Islamic Quiz Challenge)» — the in-app daily quiz in the Islamic hub (founder, 18/10/2026:
 * in the app, not a Telegram poll — to bring people back every day). Four answers, one correct, an explanation shown
 * after answering, and the exact source of every fact (Surah:Ayah, or the hadith with its sunnah.com numbering);
 * topics: fasting, Zakat, Salat and halal trade. Five questions a day (the same set for everyone), the day's score
 * and the streak of days played (kept on the device). At 12:30 the channel gets a short teaser with a button into
 * the app. The wording is to be reviewed with a local Imam (as lib/islamic-tips.ts). Pure (islamic-quiz.test.ts).
 */
import * as G from "@/lib/islamic/glossary"

export type QuizTopic = "fasting" | "zakat" | "salat" | "trade"

export type IslamicQuiz = {
  id: string
  topic: QuizTopic
  question: string
  options: [string, string, string, string]
  /** Index of the correct answer in `options`. */
  correct: 0 | 1 | 2 | 3
  /** Shown after the person answers. */
  explanation: string
  source: { label: string; url: string }
}

const quran = (surah: string, s: number, a: number) => ({ label: `${surah} ${s}:${a}`, url: `https://quran.com/${s}/${a}` })

export const ISLAMIC_QUIZZES: IslamicQuiz[] = [
  {
    id: "zakat-rate",
    topic: "zakat",
    question: "ហ្សាកាត់លើប្រាក់សន្សំ (មាស ប្រាក់ ឬលុយ) ដែលគ្រប់នីសាប និងគ្រប់មួយឆ្នាំចន្ទគតិ ត្រូវចេញប៉ុន្មានភាគរយ?",
    options: ["១%", "២,៥%", "៥%", "១០%"],
    correct: 1,
    explanation: "២,៥% (មួយភាគបួននៃមួយភាគដប់) នៃទ្រព្យដែលគ្រប់នីសាប។ ប្រភព៖ Sahih al-Bukhari 1454",
    source: { label: "Sahih al-Bukhari 1454", url: "https://sunnah.com/bukhari:1454" },
  },
  {
    id: "zakat-hawl",
    topic: "zakat",
    question: "ទ្រព្យដែលគ្រប់នីសាប ត្រូវកាន់ទុករយៈពេលប៉ុន្មាន ទើបត្រូវចេញហ្សាកាត់?",
    options: ["មួយខែ", "ប្រាំមួយខែ", "មួយឆ្នាំចន្ទគតិ (ហាវល៍)", "ពីរឆ្នាំ"],
    correct: 2,
    explanation: "គ្មានហ្សាកាត់លើទ្រព្យ រហូតដល់គ្រប់មួយឆ្នាំចន្ទគតិ (ហាវល៍)។ ប្រភព៖ Sunan Abi Dawud 1573",
    source: { label: "Sunan Abi Dawud 1573", url: "https://sunnah.com/abudawud:1573" },
  },
  {
    id: "zakat-nisab-gold",
    topic: "zakat",
    question: "នីសាបមាស (កម្រិតអប្បបរមាដែលត្រូវចេញហ្សាកាត់) គឺ ២០ ឌីណារ។ តើស្មើនឹងមាសប្រហែលប៉ុន្មានក្រាម?",
    options: ["២០ ក្រាម", "៥០ ក្រាម", "៨៥ ក្រាម", "២០០ ក្រាម"],
    correct: 2,
    explanation: "២០ ឌីណារ ≈ មាស ៨៥ ក្រាម (តាមការគណនាទូទៅ)។ ប្រភព៖ Sunan Abi Dawud 1573",
    source: { label: "Sunan Abi Dawud 1573", url: "https://sunnah.com/abudawud:1573" },
  },
  {
    id: "riba",
    topic: "trade",
    question: "តាមគម្ពីរគួរអាន តើអល់ឡោះអនុញ្ញាតអ្វី និងហាមឃាត់អ្វី?",
    options: ["អនុញ្ញាតការប្រាក់ ហាមការជួញដូរ", "អនុញ្ញាតការជួញដូរ ហាមការប្រាក់ (រីបា)", "ហាមទាំងពីរ", "អនុញ្ញាតទាំងពីរ"],
    correct: 1,
    explanation: "«អល់ឡោះអនុញ្ញាតការជួញដូរ ហើយហាមឃាត់ការប្រាក់»។ ប្រភព៖ Al-Baqarah 2:275",
    source: quran("Al-Baqarah", 2, 275),
  },
  {
    id: "write-debts",
    topic: "trade",
    question: "ពេលខ្ចី ឬឱ្យខ្ចីលុយមានកំណត់ថ្ងៃសង តើគម្ពីរគួរអានបង្គាប់ឱ្យធ្វើអ្វី?",
    options: ["ទុកចិត្តគ្នា មិនបាច់កត់", "កត់ត្រាជាលាយលក្ខណ៍អក្សរ មានសាក្សី", "និយាយប្រាប់គ្រួសារ", "ស្បថ"],
    correct: 1,
    explanation: "ចូរកត់ត្រាបំណុលដែលមានកំណត់ថ្ងៃសង ហើយមានសាក្សី។ ប្រភព៖ Al-Baqarah 2:282",
    source: quran("Al-Baqarah", 2, 282),
  },
  {
    id: "debtor-hardship",
    topic: "trade",
    question: "បើអ្នកជំពាក់យើង កំពុងជួបការលំបាកមិនអាចសងបាន តើគម្ពីរគួរអានណែនាំឱ្យធ្វើដូចម្ដេច?",
    options: ["ដាក់ការប្រាក់បន្ថែម", "ផ្ដល់ពេលរហូតដល់គាត់មានលទ្ធភាព", "ប្ដឹងភ្លាម", "យកទ្រព្យគាត់"],
    correct: 1,
    explanation: "ចូរផ្ដល់ពេលដល់គាត់ រហូតដល់មានលទ្ធភាព ហើយការលើកលែងជាសាដាកះ ល្អជាង។ ប្រភព៖ Al-Baqarah 2:280",
    source: quran("Al-Baqarah", 2, 280),
  },
  {
    id: "honest-merchant",
    topic: "trade",
    question: "ឈ្មួញស្មោះត្រង់ និងទុកចិត្តបាន នឹងនៅជាមួយនរណានៅថ្ងៃបរលោក?",
    options: ["ជាមួយស្ដេច", "ជាមួយព្យាការី អ្នកស្មោះត្រង់ និងអ្នកពលី", "ជាមួយអ្នកមាន", "គ្មានចម្លើយ"],
    correct: 1,
    explanation: "ឈ្មួញស្មោះត្រង់ ទុកចិត្តបាន នៅជាមួយព្យាការី អ្នកស្មោះត្រង់ និងអ្នកពលី។ ប្រភព៖ Jami' at-Tirmidhi 1209",
    source: { label: "Jami' at-Tirmidhi 1209", url: "https://sunnah.com/tirmidhi:1209" },
  },
  {
    id: "no-cheating",
    topic: "trade",
    question: "ការលាក់ទំនិញខូចនៅខាងក្រោម ហើយដាក់ទំនិញល្អនៅលើ (បោកបញ្ឆោតអ្នកទិញ) មានហាទីសថាដូចម្ដេច?",
    options: ["ជាល្បិចជំនួញធម្មតា", "អ្នកបោកបញ្ឆោត មិនមែនជាពួកយើងទេ", "អាចធ្វើបានបើលក់ថោក", "គ្មានបញ្ហា"],
    correct: 1,
    explanation: "«អ្នកណាបោកបញ្ឆោត អ្នកនោះមិនមែនពួកយើងទេ» — ព្យាការីមានប្រសាសន៍ ពេលឃើញគំនរអាហារសើមនៅខាងក្រោម។ ប្រភព៖ Sahih Muslim 102",
    source: { label: "Sahih Muslim 102", url: "https://sunnah.com/muslim:102" },
  },
  {
    id: "own-hands",
    topic: "trade",
    question: "តើអាហារបែបណាដែលល្អបំផុត តាមហាទីស?",
    options: ["អាហារដែលទទួលបានដោយមិនបាច់ធ្វើការ", "អាហារដែលបានមកពីកម្លាំងដៃខ្លួនឯង", "អាហារថ្លៃបំផុត", "អាហារពីការខ្ចី"],
    correct: 1,
    explanation: "គ្មានអាហារណាល្អជាងអាហារពីកម្លាំងដៃខ្លួនឯងទេ — ព្យាការីដាវូដក៏ហូបពីការងារដៃខ្លួនឯង។ ប្រភព៖ Sahih al-Bukhari 2072",
    source: { label: "Sahih al-Bukhari 2072", url: "https://sunnah.com/bukhari:2072" },
  },
  {
    id: "no-waste",
    topic: "trade",
    question: "គម្ពីរគួរអានមានបន្ទូលអំពីការហូប និងការផឹកដូចម្ដេច?",
    options: ["ហូបឱ្យច្រើនបំផុត", "ហូប និងផឹក តែកុំខ្ជះខ្ជាយ", "កុំហូបពេលយប់", "ហូបតែម្ដងក្នុងមួយថ្ងៃ"],
    correct: 1,
    explanation: "«ចូរហូប និងផឹក ប៉ុន្តែកុំខ្ជះខ្ជាយ — ទ្រង់មិនស្រឡាញ់អ្នកខ្ជះខ្ជាយទេ»។ ប្រភព៖ Al-A'raf 7:31",
    source: quran("Al-A'raf", 7, 31),
  },
  {
    id: "sadaqah",
    topic: "zakat",
    question: "ការធ្វើទាន (សាដាកះ) ធ្វើឱ្យទ្រព្យសម្បត្តិរបស់យើងយ៉ាងដូចម្ដេច?",
    options: ["ធ្វើឱ្យទ្រព្យថយចុះ", "មិនធ្វើឱ្យទ្រព្យថយចុះទេ", "ធ្វើឱ្យក្ស័យធន", "គ្មានឥទ្ធិពល ហើយគ្មានផលបុណ្យ"],
    correct: 1,
    explanation: `«សាដាកះមិនធ្វើឱ្យទ្រព្យថយចុះទេ» — តែនាំមក${G.BARAKAH}។ ប្រភព៖ Sahih Muslim 2588`,
    source: { label: "Sahih Muslim 2588", url: "https://sunnah.com/muslim:2588" },
  },
  {
    id: "mon-thu",
    topic: "fasting",
    question: `ហេតុអ្វី${G.PROPHET_FULL} តែងបួសថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍?`,
    options: ["ព្រោះជាថ្ងៃបុណ្យ", "ព្រោះអំពើត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ", "ព្រោះជាថ្ងៃផ្សារ", "ព្រោះជាថ្ងៃឈប់សម្រាក"],
    correct: 1,
    explanation: "អំពើត្រូវបានបង្ហាញនៅថ្ងៃច័ន្ទ និងព្រហស្បតិ៍ ហើយលោកចង់ឱ្យអំពើលោកត្រូវបង្ហាញ ពេលលោកកំពុងបួស។ ប្រភព៖ Jami' at-Tirmidhi 747",
    source: { label: "Jami' at-Tirmidhi 747", url: "https://sunnah.com/tirmidhi:747" },
  },
  {
    id: "salat-five",
    topic: "salat",
    question: "តើការថ្វាយបង្គំ (សឡាត) ជាកាតព្វកិច្ចប៉ុន្មានពេលក្នុងមួយថ្ងៃ?",
    options: ["៣ ពេល", "៥ ពេល", "៧ ពេល", "១ ពេល"],
    correct: 1,
    explanation: "សឡាត ៥ ពេលក្នុងមួយថ្ងៃ ជាកាតព្វកិច្ច ដែលអល់ឡោះបានបង្គាប់នៅយប់ Isra' និង Mi'raj។ ប្រភព៖ Sahih al-Bukhari 349",
    source: { label: "Sahih al-Bukhari 349", url: "https://sunnah.com/bukhari:349" },
  },
  {
    id: "salat-jamaah",
    topic: "salat",
    question: "ការថ្វាយបង្គំជាក្រុម (ជាមាអះ) មានផលបុណ្យច្រើនជាងថ្វាយបង្គំម្នាក់ឯង ប៉ុន្មានដង?",
    options: ["២ ដង", "១០ ដង", "២៧ ដង", "១០០ ដង"],
    correct: 2,
    explanation: "សឡាតជាក្រុម ប្រសើរជាងសឡាតម្នាក់ឯង ២៧ កម្រិត។ ប្រភព៖ Sahih al-Bukhari 645",
    source: { label: "Sahih al-Bukhari 645", url: "https://sunnah.com/bukhari:645" },
  },
  {
    id: "jumuah-trade",
    topic: "salat",
    question: `ពេលគេអំពាវនាវឱ្យថ្វាយបង្គំ${G.JUMUAH} នៅថ្ងៃសុក្រ តើគម្ពីរគួរអានបង្គាប់ឱ្យធ្វើអ្វីជាមួយការលក់ដូរ?`,
    options: ["បន្តលក់ដូរ", "ទុកការលក់ដូរមួយឡែក ហើយទៅថ្វាយបង្គំ", "លក់តែពាក់កណ្ដាលថ្ងៃ", "បិទហាងពេញមួយថ្ងៃ"],
    correct: 1,
    explanation: "ចូរប្រញាប់ទៅរំលឹកអល់ឡោះ ហើយទុកការលក់ដូរមួយឡែក — ក្រោយសឡាតចប់ អាចរកស៊ីបន្តបាន។ ប្រភព៖ Al-Jumu'ah 62:9",
    source: quran("Al-Jumu'ah", 62, 9),
  },
  {
    id: "ramadan-verse",
    topic: "fasting",
    question: "ការបួសខែរ៉ាម៉ាឌន ត្រូវបានបង្គាប់នៅក្នុងស៊ូរ៉ោះណា នៃគម្ពីរគួរអាន?",
    options: ["Al-Fatihah", "Al-Baqarah", "Al-Kahf", "Al-Mulk"],
    correct: 1,
    explanation: "«ការបួសត្រូវបានកំណត់លើពួកអ្នក ដូចដែលបានកំណត់លើអ្នកមុនៗ» — ស៊ូរ៉ោះ Al-Baqarah។ ប្រភព៖ Al-Baqarah 2:183",
    source: quran("Al-Baqarah", 2, 183),
  },
  {
    id: "fast-hours",
    topic: "fasting",
    question: "ការបួសមួយថ្ងៃ ចាប់ផ្ដើម និងបញ្ចប់នៅពេលណា?",
    options: ["ពីពាក់កណ្ដាលអធ្រាត្រ ដល់ថ្ងៃត្រង់", "ពីអរុណោទ័យ (ស៊ុពហ៍) ដល់ថ្ងៃលិច (ម៉ាហ្គ្រិប)", "ពីថ្ងៃរះ ដល់ថ្ងៃលិច", "ពេញ ២៤ ម៉ោង"],
    correct: 1,
    explanation: `បួសពីពេលពន្លឺអរុណោទ័យ រហូតដល់យប់ចូល — ${G.IMSAK} ជាការប្រុងប្រយ័ត្ន ១០ នាទីមុនស៊ុពហ៍។ ប្រភព៖ Al-Baqarah 2:187`,
    source: quran("Al-Baqarah", 2, 187),
  },
  {
    id: "sahur-barakah",
    topic: "fasting",
    question: `ហេតុអ្វីស៊ុណ្ណះណែនាំឱ្យ${G.SAHUR_MEAL} មុនបួស?`,
    options: ["ព្រោះជាកាតព្វកិច្ច", `ព្រោះក្នុងនោះមាន${G.BARAKAH}`, "ព្រោះហាមបួសបើមិនហូប", "គ្មានហេតុផល"],
    correct: 1,
    explanation: `«ចូរ${G.SAHUR} ព្រោះក្នុង${G.SAHUR}មាន${G.BARAKAH}»។ ប្រភព៖ Sahih al-Bukhari 1923`,
    source: { label: "Sahih al-Bukhari 1923", url: "https://sunnah.com/bukhari:1923" },
  },
  {
    id: "hasten-iftar",
    topic: "fasting",
    question: `ពេលដល់ម៉ោង${G.IFTAR} (ថ្ងៃលិច) តើស៊ុណ្ណះណែនាំឱ្យធ្វើដូចម្ដេច?`,
    options: ["ពន្យារពេលឱ្យយូរ", `ប្រញាប់${G.IFTAR}`, "រង់ចាំដល់អ៊ីស្យា", "បួសបន្តដល់ព្រឹក"],
    correct: 1,
    explanation: `មនុស្សនៅតែល្អ ដរាបណាពួកគេប្រញាប់${G.IFTAR}។ ប្រភព៖ Sahih al-Bukhari 1957`,
    source: { label: "Sahih al-Bukhari 1957", url: "https://sunnah.com/bukhari:1957" },
  },
  {
    id: "zakat-recipients",
    topic: "zakat",
    question: "តាមគម្ពីរគួរអាន ហ្សាកាត់ត្រូវចែកជូនអ្នកមានសិទ្ធិប៉ុន្មានក្រុម?",
    options: ["៣ ក្រុម", "៥ ក្រុម", "៨ ក្រុម", "១២ ក្រុម"],
    correct: 2,
    explanation: "៨ ក្រុម៖ ជនក្រីក្រ អ្នកខ្វះខាត អ្នកប្រមូល អ្នកទើបចូលឥស្លាម ទាសករ អ្នកជំពាក់ ផ្លូវអល់ឡោះ និងអ្នកដំណើរ។ ប្រភព៖ At-Tawbah 9:60",
    source: quran("At-Tawbah", 9, 60),
  },
]

/** Questions a day. */
export const QUIZ_SET_SIZE = 5

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)

/** The day's five questions — the same for everyone; consecutive days walk through the whole bank. */
export function dailyQuizSet(day: string, size = QUIZ_SET_SIZE): IslamicQuiz[] {
  const n = ISLAMIC_QUIZZES.length
  const start = (((dayNumber(day) * size) % n) + n) % n
  return Array.from({ length: Math.min(size, n) }, (_, i) => ISLAMIC_QUIZZES[(start + i) % n])
}

export const TOPIC_LABEL: Record<QuizTopic, string> = { fasting: "ការបួស", zakat: "ហ្សាកាត់", salat: "សឡាត", trade: "ជំនួញហាឡាល់" }

// ─── Score and streak (kept on the device) ───────────────────────────────────────────────────────

export type QuizProgress = {
  /** The day being played and the answers chosen so far (question id → option index). */
  day: string | null
  answers: Record<string, number>
  /** Consecutive days with the set finished, and the last such day. */
  streak: number
  lastFinished: string | null
  best: number
}

export const EMPTY_PROGRESS: QuizProgress = { day: null, answers: {}, streak: 0, lastFinished: null, best: 0 }

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Today's progress: yesterday's answers are cleared; a streak survives only if yesterday's set was finished. */
export function progressFor(saved: QuizProgress | null | undefined, today: string): QuizProgress {
  const p = saved ?? EMPTY_PROGRESS
  const alive = p.lastFinished === today || p.lastFinished === addDays(today, -1)
  return { ...p, day: today, answers: p.day === today ? p.answers : {}, streak: alive ? p.streak : 0 }
}

/** One answer (the first answer to a question counts; changing it is not allowed). */
export function answerQuestion(p: QuizProgress, today: string, set: IslamicQuiz[], id: string, option: number): QuizProgress {
  if (p.answers[id] !== undefined || !set.some((q) => q.id === id)) return p
  const answers = { ...p.answers, [id]: option }
  const finished = set.every((q) => answers[q.id] !== undefined)
  if (!finished || p.lastFinished === today) return { ...p, answers }
  const streak = p.lastFinished === addDays(today, -1) ? p.streak + 1 : 1
  return { ...p, answers, streak, lastFinished: today, best: Math.max(p.best, streak) }
}

export const scoreOf = (p: QuizProgress, set: IslamicQuiz[]) => set.filter((q) => p.answers[q.id] === q.correct).length

// ─── The channel's 12:30 teaser ───────────────────────────────────────────────────────────────────

export const QUIZ_APP_URL = "https://app.luychlat.com/islamic?tab=quiz"
export const QUIZ_BUTTON_TEXT = "🎮 ចូលលេងក្នុងអេបឥឡូវនេះ"

/** A short text (no poll, no poster): today's topics and the first question, then the button into the app. */
export function quizTeaserHtml(day: string): string {
  const set = dailyQuizSet(day)
  const topics = [...new Set(set.map((q) => TOPIC_LABEL[q.topic]))].join(" · ")
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return [
    "🎮 <b>ល្បងប្រាជ្ញាច្បាប់សាសនា ប្រចាំថ្ងៃ</b>",
    `ប្រធានបទថ្ងៃនេះ៖ ${topics}`,
    "",
    `❓ ${esc(set[0].question)}`,
    "",
    `ឆ្លើយ ${set.length} សំណួរក្នុងអេប ហើយរក្សាថ្ងៃលេងជាប់ៗគ្នា (Streak) របស់អ្នក!`,
  ].join("\n")
}

export const quizTeaserButtons = () => ({ inline_keyboard: [[{ text: QUIZ_BUTTON_TEXT, url: QUIZ_APP_URL }]] })
