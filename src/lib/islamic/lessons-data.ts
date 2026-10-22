import * as G from "@/lib/islamic/glossary"
import { ISLAMIC_QUIZZES, type IslamicQuiz } from "@/lib/islamic-quiz"

/**
 * Islamic bitesize lessons (founder, 19/10/2026): four modules for Cambodian Muslims — belief and the pillars, wudu
 * and the prayer, fasting, halal business and zakat — each lesson a short read with its Quran / Hadith sources
 * and the quiz questions that test it (lib/islamic-quiz.ts). Kept short (about a minute each) so a reviewer can check every line; the reviewer may lengthen them.
 *
 * Sources: only references the app already uses and checks (lib/scripture.ts, the quiz sources) plus a few of the
 * best-known texts (the five pillars, the hadith of Jibril, the wudu verse); Quran as Surah:Ayah (quran.com), Hadith
 * numbers as sunnah.com. Rulings follow the Shafi'i school, as most Cambodian Muslims do. The Khmer and English lines
 * are the meaning, not the Quran itself.
 *
 * No lesson is shown until a local Imam or teacher has read it (`reviewedBy`): `publishedLessons()` returns only the
 * reviewed ones — no religious text reaches people on the app's word alone. Pure (lessons-data.test.ts).
 */

export type LessonCitation = { label: string; url: string; kind: "quran" | "hadith" }
export type LessonText = { km: string; en: string }

export type Lesson = {
  id: string
  module: ModuleId
  title: LessonText
  /** Short paragraphs — a read of a few minutes at most. */
  body: { km: string[]; en: string[] }
  citations: LessonCitation[]
  /** Quiz questions that test this lesson (ids in ISLAMIC_QUIZZES). */
  quizIds: string[]
  /** Who checked it (an Imam or teacher, with the date) — null until then, and then it is not shown. */
  reviewedBy: string | null
}

export type ModuleId = "aqidah" | "salat" | "fasting" | "halal-business"
export type LessonModule = { id: ModuleId; order: number; title: LessonText; summary: LessonText }

const quran = (surah: string, s: number, a: string): LessonCitation => ({ label: `${surah} ${s}:${a}`, url: `https://quran.com/${s}/${a.split(/[–-]/)[0]}`, kind: "quran" })
const hadith = (label: string, path: string): LessonCitation => ({ label, url: `https://sunnah.com/${path}`, kind: "hadith" })

export const LESSON_MODULES: LessonModule[] = [
  {
    id: "aqidah",
    order: 1,
    title: { km: "អាគីដះ និងសសរស្ដម្ភនៃឥស្លាម", en: "Aqidah and the pillars of Islam" },
    summary: { km: "ជំនឿទាំងប្រាំមួយ និងសសរស្ដម្ភទាំងប្រាំ ដែលជាគ្រឹះនៃជីវិតមូស្លីម។", en: "The six pillars of faith and the five pillars of Islam — the foundation of a Muslim's life." },
  },
  {
    id: "salat",
    order: 2,
    title: { km: `${G.WUDU} និងសឡាត`, en: "Wudu and salat in practice" },
    summary: { km: "ការសម្អាតខ្លួនមុនសឡាត និងសឡាតទាំងប្រាំពេលក្នុងមួយថ្ងៃ។", en: "Purifying before prayer, and the five daily prayers." },
  },
  {
    id: "fasting",
    order: 3,
    title: { km: `ច្បាប់នៃការបួស និង${G.SUNNAH_FAST}`, en: "Fasting rules and sunnah fasts" },
    summary: { km: "ពេលវេលានៃការបួស អ្វីដែលធ្វើឲ្យខូចបួស និងការបួសស្ម័គ្រចិត្ត។", en: "The hours of the fast, what breaks it, and voluntary fasts." },
  },
  {
    id: "halal-business",
    order: 4,
    title: { km: "ក្រមសីលធម៌ជំនួញហាឡាល់ និងហ្សាកាត់", en: "Halal business ethics and zakat" },
    summary: { km: "ការលក់ដូរដោយស្មោះត្រង់ គ្មានការប្រាក់ និងរបៀបគណនាហ្សាកាត់។", en: "Honest trade without interest, and how zakat is calculated." },
  },
]

export const LESSONS: Lesson[] = [
  // ─── Module 1 · Aqidah ──────────────────────────────────────────────────────────────────────────
  {
    id: "five-pillars",
    module: "aqidah",
    title: { km: "សសរស្ដម្ភទាំងប្រាំនៃឥស្លាម", en: "The five pillars of Islam" },
    body: {
      km: [
        `${G.PROPHET_FULL} បានមានប្រសាសន៍ថា ឥស្លាមត្រូវបានសាងសង់លើសសរស្ដម្ភប្រាំ — ដូចផ្ទះមួយដែលឈរនឹងបាន ដោយសារសសរទាំងប្រាំ។`,
        "ទីមួយ ស្ហាហាដះ៖ ការបញ្ជាក់ដោយចិត្ត និងមាត់ថា គ្មានព្រះណាដែលត្រូវគោរពសក្ការៈ ក្រៅពីអល់ឡោះ ហើយមូហាំម៉ាត់ជាអ្នកនាំសាររបស់ព្រះអង្គ។ នេះជាទ្វារចូលឥស្លាម។",
        "ទីពីរ សឡាត៖ ការថ្វាយបង្គំប្រាំពេលក្នុងមួយថ្ងៃ តាមពេលវេលាកំណត់ — ទំនាក់ទំនងប្រចាំថ្ងៃរវាងមនុស្ស និងអល់ឡោះ។",
        "ទីបី ហ្សាកាត់៖ ការចែកផ្នែកមួយនៃទ្រព្យ (២,៥% លើទ្រព្យដែលគ្រប់នីសាប និងគ្រប់មួយឆ្នាំចន្ទគតិ) ទៅអ្នកដែលមានសិទ្ធិ — ការសម្អាតទ្រព្យ។",
        "ទីបួន ការបួសខែរ៉ាម៉ាឌន៖ ចាប់ពីអរុណោទ័យដល់ថ្ងៃលិច ពេញមួយខែ។ ទីប្រាំ ហាជ្ជី៖ ការធ្វើធម្មយាត្រាទៅកាន់ម៉ាក្កះ ម្ដងក្នុងមួយជីវិត សម្រាប់អ្នកដែលមានលទ្ធភាព។",
        `សសរនីមួយៗ មានទាំងផ្នែកខាងក្នុង (ចិត្ត និង${G.NIYYAH}) និងផ្នែកខាងក្រៅ (ការអនុវត្ត)។ មេរៀនបន្ទាប់ៗ នឹងពន្យល់សសរនីមួយៗ ឲ្យកាន់តែលម្អិត។`,
      ],
      en: [
        "The Prophet ﷺ said that Islam is built on five pillars — like a house that stands because of its five columns.",
        "First, the shahadah: bearing witness with the heart and the tongue that there is no god worthy of worship but Allah, and that Muhammad is His Messenger. It is the door into Islam.",
        "Second, salat: the five daily prayers at their fixed times — the daily bond between a person and Allah.",
        "Third, zakat: giving a share of one's wealth (2.5% of wealth above the nisab, held for a lunar year) to those entitled to it — the purification of wealth.",
        "Fourth, fasting in Ramadan, from dawn to sunset for the whole month. Fifth, hajj: the pilgrimage to Makkah once in a lifetime, for whoever is able.",
        "Each pillar has an inner side (the heart and the intention) and an outer side (the practice). The next lessons explain each pillar in more detail.",
      ],
    },
    citations: [hadith("Sahih al-Bukhari 8", "bukhari:8"), hadith("Sahih Muslim 16", "muslim:16")],
    quizIds: ["salat-five", "ramadan-verse", "zakat-rate"],
    reviewedBy: null,
  },
  {
    id: "six-pillars-iman",
    module: "aqidah",
    title: { km: "ជំនឿទាំងប្រាំមួយ (អ៊ីម៉ាន)", en: "The six pillars of faith (iman)" },
    body: {
      km: [
        "ថ្ងៃមួយ ម៉ាឡាអ៊ីកាត់ជីព្រីល បានមកក្នុងរូបជាបុរសម្នាក់ ហើយសួរព្យាការីអំពីឥស្លាម អ៊ីម៉ាន និងអ៊ីហ្សាន — ដើម្បីបង្រៀនមិត្តសហការីរបស់លោក (សាហាបះ) អំពីគ្រឹះនៃសាសនា។",
        "អ៊ីម៉ាន គឺជំនឿលើ៖ (១) អល់ឡោះ មួយគត់ គ្មានដៃគូ (២) ម៉ាឡាអ៊ីកាត់ (៣) គម្ពីរដែលព្រះអង្គបានបញ្ចុះ (៤) អ្នកនាំសាររបស់ព្រះអង្គ (៥) ថ្ងៃបរលោក និង (៦) ការកំណត់ (កទ៌) ទាំងល្អ និងអាក្រក់។",
        "ជំនឿលើអល់ឡោះមួយគត់ (តាវហ៊ីទ) ត្រូវបានសង្ខេបក្នុង Surah Al-Ikhlas៖ ព្រះអង្គមួយគត់ ជាទីពឹង មិនបង្កើតកូន មិនកើតពីនរណា ហើយគ្មានអ្វីប្រៀបស្មើព្រះអង្គឡើយ។",
        "អ៊ីហ្សាន គឺការគោរពសក្ការៈអល់ឡោះ ហាក់ដូចជាអ្នកឃើញព្រះអង្គ — ហើយបើអ្នកមិនឃើញព្រះអង្គ ព្រះអង្គពិតជាឃើញអ្នក។",
        "ជំនឿលើការកំណត់ មិនមែនមានន័យថាឈប់ខិតខំទេ — យើងខិតខំឲ្យអស់ពីសមត្ថភាព រួចប្រគល់លទ្ធផលទៅអល់ឡោះ (តាវ៉ាក្កុល)។ ក្នុងជីវិតប្រចាំថ្ងៃ និងការរកស៊ី នេះនាំមកនូវចិត្តស្ងប់។",
      ],
      en: [
        "One day the angel Jibril came in the form of a man and asked the Prophet ﷺ about islam, iman and ihsan — to teach the Companions the foundations of the religion.",
        "Iman is belief in: (1) Allah, One, without partner; (2) His angels; (3) His revealed books; (4) His messengers; (5) the Last Day; and (6) the divine decree, its good and its bad.",
        "Belief in the One God (tawhid) is summed up in Surah Al-Ikhlas: He is One, the Eternal Refuge; He neither begets nor is born, and nothing is comparable to Him.",
        "Ihsan is to worship Allah as though you see Him — and though you do not see Him, He surely sees you.",
        "Belief in the decree does not mean ceasing to strive — we do our utmost, then entrust the outcome to Allah (tawakkul). In daily life and in business, this brings a calm heart.",
      ],
    },
    citations: [hadith("Sahih Muslim 8", "muslim:8"), quran("Al-Ikhlas", 112, "1–4")],
    quizIds: [],
    reviewedBy: null,
  },

  // ─── Module 2 · Wudu and salat ─────────────────────────────────────────────────────────────────
  {
    id: "wudu-steps",
    module: "salat",
    title: { km: `របៀប${G.WUDU} (វូឌូ)`, en: "How to perform wudu" },
    body: {
      km: [
        `សឡាតមិនត្រូវបានទទួលយកទេ បើគ្មានការសម្អាតខ្លួន។ ដូច្នេះ មុនសឡាត យើងត្រូវ${G.WUDU} (វូឌូ) តាមការណែនាំក្នុងគម្ពីរគួរអាន ស៊ូរ៉ាត់ Al-Ma'idah ៥:៦។`,
        `តាមមាសហាប់សាហ្វីអ៊ី ផ្នែកដែលជាកាតព្វកិច្ចមានប្រាំមួយ៖ (១) ${G.NIYYAH}ក្នុងចិត្ត ពេលចាប់ផ្ដើមលាងមុខ (២) លាងមុខទាំងមូល (៣) លាងដៃទាំងពីរ រហូតដល់កែងដៃ (៤) ជូតក្បាលមួយផ្នែក ដោយដៃសើម (៥) លាងជើងទាំងពីរ រហូតដល់កជើង និង (៦) ធ្វើតាមលំដាប់នេះ។`,
        `${G.SUNNAH} (ការអនុវត្តដែលល្អ) រួមមាន៖ សូត្រ «ប៊ីស្មិល្លាហ៍» លាងដៃមុន ខ្ពុរមាត់ និងស្រូបទឹកចូលច្រមុះ ជូតត្រចៀក និងលាងម្ដងៗ បីដង។`,
        `របស់ដែលធ្វើឲ្យខូចវូឌូ ដូចជា ការបត់ជើងតូចធំ ការបញ្ចេញខ្យល់ និងការដេកលក់ស្កប់ (មិនអង្គុយរឹងមាំ)។ ពេលនោះ ត្រូវ${G.WUDU}ម្ដងទៀតមុនសឡាត។`,
        "ប្រើទឹកឲ្យល្មម — ព្យាការីបានយកវូឌូដោយទឹកតិចតួច។ ការសន្សំទឹក ក៏ជាការគោរពពរជ័យរបស់អល់ឡោះដែរ។",
      ],
      en: [
        "Prayer is not accepted without purification. So before praying we perform wudu, as taught in the Quran, Surah Al-Ma'idah 5:6.",
        "In the Shafi'i school its obligatory parts are six: (1) the intention in the heart as one begins washing the face; (2) washing the whole face; (3) washing both arms up to the elbows; (4) wiping part of the head with a wet hand; (5) washing both feet up to the ankles; and (6) keeping this order.",
        "Its sunnah (recommended) acts include: saying «Bismillah», washing the hands first, rinsing the mouth and the nose, wiping the ears, and washing each part three times.",
        "Wudu is broken by, for example, using the toilet, passing wind, and deep sleep (not seated firmly). Then wudu is renewed before praying.",
        "Use water sparingly — the Prophet ﷺ made wudu with very little water. Saving water also honours Allah's blessings.",
      ],
    },
    citations: [quran("Al-Ma'idah", 5, "6"), hadith("Sahih Muslim 224", "muslim:224")],
    quizIds: [],
    reviewedBy: null,
  },
  {
    id: "five-prayers",
    module: "salat",
    title: { km: "សឡាតទាំងប្រាំពេល", en: "The five daily prayers" },
    body: {
      km: [
        `សឡាតជាកាតព្វកិច្ចលើអ្នកមានជំនឿ តាមពេលវេលាកំណត់ (An-Nisa ៤:១០៣)៖ ${G.PRAYER_NAMES.fajr} (ពីអរុណោទ័យ) ${G.PRAYER_NAMES.dhuhr} (ថ្ងៃត្រង់) ${G.PRAYER_NAMES.asr} (រសៀល) ${G.PRAYER_NAMES.maghrib} (ថ្ងៃលិច) និង${G.PRAYER_NAMES.isha} (យប់)។`,
        "នៅយប់អ៊ីស្រក-មីអ៊្រាជ សឡាតត្រូវបានកំណត់ជាប្រាំពេល — ជាអំណោយផ្ទាល់ពីអល់ឡោះទៅកាន់ព្យាការី និងសហគមន៍របស់លោក។",
        "សឡាតនីមួយៗ ចាប់ផ្ដើមដោយ «អល់ឡោះហ៊ូអាក់បារ» ឈរ សូត្រ Al-Fatihah ឱនកាយ (រូកូក) ងើបឈរ ក្រាបពីរដង (ស៊ូជូដ) អង្គុយ ហើយបញ្ចប់ដោយសាឡាម — ធ្វើយឺតៗ និងស្ងប់ស្ងាត់ (ទូម៉ានីណះ)។",
        "សឡាតជាក្រុម (ជាម៉ាអះ) នៅម៉ាស្ជិទ មានផលបុណ្យច្រើនជាងសឡាតម្នាក់ឯង ២៧ ដង។ ថ្ងៃសុក្រ បុរសចូលរួមសឡាត${G.JUMUAH} ហើយទុកការលក់ដូរមួយឡែក (Al-Jumu'ah ៦២:៩)។",
        "ទំព័រ «ម៉ោងសឡាត» ក្នុង អេប លុយឆ្លាត បង្ហាញពេលវេលាតាមខេត្តរបស់អ្នក — សូមផ្ទៀងផ្ទាត់ជាមួយម៉ាស្ជិទក្នុងស្រុក។",
      ],
      en: [
        "Prayer is decreed upon the believers at fixed times (An-Nisa 4:103): Fajr (from dawn), Dhuhr (midday), Asr (afternoon), Maghrib (sunset) and Isha (night).",
        "On the night of Isra' and Mi'raj the prayers were set at five — a gift from Allah directly to the Prophet ﷺ and his community.",
        "Each prayer begins with «Allahu akbar», standing, reciting Al-Fatihah, bowing (ruku'), rising, prostrating twice (sujud), sitting, and ends with the salam — done slowly and calmly (tuma'ninah).",
        "Prayer in congregation (jama'ah) at the mosque is worth twenty-seven times praying alone. On Friday men attend the Jumu'ah prayer and leave trading aside (Al-Jumu'ah 62:9).",
        "The «Prayer times» page in App Luy Chlat shows the times for your province — please check them against your local mosque.",
      ],
    },
    citations: [quran("An-Nisa", 4, "103"), hadith("Sahih al-Bukhari 349", "bukhari:349"), hadith("Sahih al-Bukhari 645", "bukhari:645"), quran("Al-Jumu'ah", 62, "9")],
    quizIds: ["salat-five", "salat-jamaah", "jumuah-trade"],
    reviewedBy: null,
  },

  // ─── Module 3 · Fasting ────────────────────────────────────────────────────────────────────────
  {
    id: "fasting-rules",
    module: "fasting",
    title: { km: "ពេលវេលា និងច្បាប់នៃការបួស", en: "The hours and rules of the fast" },
    body: {
      km: [
        "ការបួសខែរ៉ាម៉ាឌន ត្រូវបានកំណត់លើអ្នកមានជំនឿ ដូចដែលបានកំណត់លើសហគមន៍មុនៗ ដើម្បីឲ្យយើងមានតាក់វ៉ា — ការកោតខ្លាច និងប្រុងប្រយ័ត្នចំពោះអល់ឡោះ (Al-Baqarah ២:១៨៣)។",
        `ការបួស ចាប់ពីអរុណោទ័យ (${G.PRAYER_NAMES.fajr}) រហូតដល់ថ្ងៃលិច (${G.PRAYER_NAMES.maghrib})៖ មិនបរិភោគ មិនផឹក និងមិនរួមដំណេក (Al-Baqarah ២:១៨៧)។ ${G.IMSAK} គឺប្រហែល ១០ នាទីមុនស៊ុពហ៍ ជាការប្រុងប្រយ័ត្ន។`,
        `${G.NIYYAH}៖ សម្រាប់ការបួសរ៉ាម៉ាឌន តាមមាសហាប់សាហ្វីអ៊ី ត្រូវមាន${G.NIYYAH}នៅពេលយប់ មុនអរុណោទ័យ សម្រាប់ថ្ងៃនីមួយៗ។ ${G.SAHUR} មាន${G.BARAKAH} ហើយ${G.IFTAR}ឲ្យឆាប់ ពេលដល់ម៉ោង។`,
        "បើភ្លេចហើយបរិភោគ ឬផឹក ការបួសមិនខូចទេ — ចូរបន្តបួសរហូតដល់ចប់ ព្រោះអល់ឡោះបានផ្ដល់អាហារនោះឲ្យ។",
        "អ្នកឈឺ និងអ្នកធ្វើដំណើរ អាចពន្យារការបួស ហើយសងវិញនៅថ្ងៃផ្សេង (Al-Baqarah ២:១៨៤)។ សម្រាប់ករណីផ្ទាល់ខ្លួន (មានផ្ទៃពោះ ជំងឺរ៉ាំរ៉ៃ) សូមពិគ្រោះជាមួយអ៊ីម៉ាម ឬលោកគ្រូ។",
      ],
      en: [
        "Fasting in Ramadan is prescribed for the believers as it was for those before them, so that we may attain taqwa — mindfulness of Allah (Al-Baqarah 2:183).",
        "The fast runs from dawn (Fajr) to sunset (Maghrib): no eating, no drinking and no marital relations (Al-Baqarah 2:187). Imsak is about 10 minutes before Fajr, as a precaution.",
        "Intention: for Ramadan, the Shafi'i school requires the intention at night, before dawn, for each day. The pre-dawn meal (sahur) carries barakah, and the fast is broken promptly when the time comes.",
        "Whoever forgets and eats or drinks has not broken the fast — let them complete it, for Allah fed them.",
        "The sick and the traveller may postpone the fast and make it up on other days (Al-Baqarah 2:184). For personal cases (pregnancy, chronic illness) please ask an Imam or teacher.",
      ],
    },
    citations: [quran("Al-Baqarah", 2, "183"), quran("Al-Baqarah", 2, "187"), quran("Al-Baqarah", 2, "184"), hadith("Sahih al-Bukhari 1933", "bukhari:1933"), hadith("Sahih al-Bukhari 1923", "bukhari:1923"), hadith("Sahih al-Bukhari 1957", "bukhari:1957")],
    quizIds: ["ramadan-verse", "fast-hours", "sahur-barakah", "hasten-iftar"],
    reviewedBy: null,
  },
  {
    id: "sunnah-fasts",
    module: "fasting",
    title: { km: G.SUNNAH_FAST, en: "Sunnah (voluntary) fasts" },
    body: {
      km: [
        `ក្រៅពីខែរ៉ាម៉ាឌន ការបួសគឺស្ម័គ្រចិត្ត (${G.SUNNAH}) — មិនមែនកាតព្វកិច្ចទេ ប៉ុន្តែមានផលបុណ្យធំ។ ${G.PROPHET_FULL} តែងបួសរៀងរាល់ថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍។`,
        "លោកបានពន្យល់ថា ទង្វើរបស់មនុស្សត្រូវបានបង្ហាញជូនអល់ឡោះ នៅថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍ ហើយលោកចង់ឲ្យទង្វើរបស់លោកត្រូវបានបង្ហាញ ខណៈលោកកំពុងបួស។",
        "អ្នកណាបួសមួយថ្ងៃ ក្នុងមាគ៌ាអល់ឡោះ អល់ឡោះនឹងដាក់មុខរបស់គេឲ្យឆ្ងាយពីភ្លើងនរក ចម្ងាយដំណើរចិតសិបឆ្នាំ។ ក្នុងឋានសួគ៌ មានទ្វារ «អ័ររ៉ាយយ៉ាន» សម្រាប់តែអ្នកតមបួសប៉ុណ្ណោះ។",
        "ថ្ងៃដែលហាមបួស៖ ថ្ងៃបុណ្យអ៊ីដទាំងពីរ (អ៊ីឌុលហ្វីត្រ និងអ៊ីឌុលអាដហា) និងថ្ងៃតាសរីក (១១–១៣ ហ្ស៊ុលហ៊ីជ្ជះ)។ ការរំលឹកបួសក្នុង អេប លុយឆ្លាត រំលងថ្ងៃទាំងនេះដោយស្វ័យប្រវត្តិ។",
        "ចាប់ផ្ដើមតិចៗ — ម្ដងក្នុងមួយសប្ដាហ៍ក៏ល្អដែរ។ ការអនុវត្តតិច តែទៀងទាត់ ជាទីស្រឡាញ់ចំពោះអល់ឡោះ។",
      ],
      en: [
        "Outside Ramadan fasting is voluntary (sunnah) — not an obligation, but greatly rewarded. The Prophet ﷺ used to fast on Mondays and Thursdays.",
        "He explained that people's deeds are presented to Allah on Mondays and Thursdays, and he loved for his deeds to be presented while he was fasting.",
        "Whoever fasts one day in the way of Allah, Allah keeps his face seventy years' distance from the Fire. In Paradise there is a gate, «Ar-Rayyan», for those who fasted alone.",
        "Days on which fasting is forbidden: the two Eids (al-Fitr and al-Adha) and the days of Tashreeq (11–13 Dhul-Hijjah). App Luy Chlat's fast reminders skip these days automatically.",
        "Start small — once a week is good too. A small deed done consistently is beloved to Allah.",
      ],
    },
    citations: [hadith("Jami' at-Tirmidhi 747", "tirmidhi:747"), hadith("Sahih al-Bukhari 2840", "bukhari:2840"), hadith("Sahih al-Bukhari 1896", "bukhari:1896")],
    quizIds: ["mon-thu"],
    reviewedBy: null,
  },

  // ─── Module 4 · Halal business and zakat ───────────────────────────────────────────────────────
  {
    id: "honest-trade",
    module: "halal-business",
    title: { km: "ការលក់ដូរដោយស្មោះត្រង់ និងគ្មានការប្រាក់", en: "Honest trade, without interest" },
    body: {
      km: [
        "អល់ឡោះបានអនុញ្ញាតការលក់ដូរ ហើយហាមឃាត់ការប្រាក់ (រីបា) (Al-Baqarah ២:២៧៥)។ ការរកស៊ី គឺជាការគោរពសក្ការៈ នៅពេលធ្វើដោយស្មោះត្រង់។",
        "ឈ្មួញដែលស្មោះត្រង់ និងទុកចិត្តបាន នឹងនៅជាមួយព្យាការី អ្នកសច្ចៈ និងអ្នកពលី នៅថ្ងៃបរលោក។ ផ្ទុយទៅវិញ «អ្នកណាបោកបញ្ឆោត មិនមែនជាពួកយើងទេ» — ការលាក់ទំនិញខូច ឬបន្លំជញ្ជីង គឺហាមឃាត់។",
        "អាហារល្អបំផុត គឺអាហារដែលមនុស្សរកបានដោយដៃខ្លួនឯង — ព្យាការីដាវូដ ក៏ធ្លាប់បរិភោគពីការងារដៃរបស់លោកដែរ។",
        "ពេលឲ្យ ឬខ្ចីលុយ ចូរកត់ត្រាជាលាយលក្ខណ៍អក្សរ (Al-Baqarah ២:២៨២) ហើយបើកូនបំណុលជួបការលំបាក ចូរពន្យារពេលឲ្យគេ (២:២៨០)។ អេប លុយឆ្លាត ជួយកត់ត្រាបំណុល និងការសងបាន។",
        "ការប្រាក់ធនាគារដែលទទួលបានរួចហើយ អ្នកប្រាជ្ញភាគច្រើនណែនាំឲ្យបរិច្ចាគទៅសប្បុរសធម៌ទូទៅ ដោយមិនរាប់ជាហ្សាកាត់ — ផ្នែក «សម្អាតការប្រាក់» ក្នុងទំព័រហិរញ្ញវត្ថុឥស្លាម តាមដានវាជូន។",
      ],
      en: [
        "Allah has permitted trade and forbidden riba (Al-Baqarah 2:275). Earning a living is worship when it is done honestly.",
        "The truthful, trustworthy merchant will be with the prophets, the truthful and the martyrs on the Last Day. In contrast, «whoever cheats is not one of us» — hiding defects or tampering with the scales is forbidden.",
        "The best food is what a person earns with their own hands — the Prophet Dawud too ate from the work of his hands.",
        "When lending or borrowing, write it down (Al-Baqarah 2:282), and if the debtor is in hardship, give them time (2:280). App Luy Chlat helps record debts and repayments.",
        "For bank interest already received, most scholars advise giving it to general welfare without counting it as zakat — the «riba purification» section of the Islamic finance page tracks it for you.",
      ],
    },
    citations: [quran("Al-Baqarah", 2, "275"), hadith("Jami' at-Tirmidhi 1209", "tirmidhi:1209"), hadith("Sahih Muslim 102", "muslim:102"), hadith("Sahih al-Bukhari 2072", "bukhari:2072"), quran("Al-Baqarah", 2, "282"), quran("Al-Baqarah", 2, "280")],
    quizIds: ["riba", "honest-merchant", "no-cheating", "own-hands", "write-debts", "debtor-hardship"],
    reviewedBy: null,
  },
  {
    id: "zakat-calculation",
    module: "halal-business",
    title: { km: "របៀបគណនាហ្សាកាត់", en: "How zakat is calculated" },
    body: {
      km: [
        "ហ្សាកាត់ សម្អាតទ្រព្យ (At-Tawbah ៩:១០៣)។ វាជាកាតព្វកិច្ច នៅពេលមានលក្ខខណ្ឌពីរ៖ ទ្រព្យគ្រប់នីសាប និងកាន់កាប់បានគ្រប់មួយឆ្នាំចន្ទគតិ (ហាវល៍)។",
        "នីសាប = ២០ ឌីណារ ≈ មាសសុទ្ធ ៨៥ ក្រាម (ឬប្រាក់ ៥៩៥ ក្រាម)។ គណនាតាមតម្លៃមាសថ្ងៃនេះ។ បើទ្រព្យសរុបតិចជាងនីសាប មិនទាន់ត្រូវចេញហ្សាកាត់ទេ។",
        "ទ្រព្យដែលរាប់៖ លុយក្នុងដៃ និងធនាគារ មាស ប្រាក់ ទំនិញសម្រាប់លក់ និងការវិនិយោគ។ ផ្ទះដែលរស់នៅ ឡាន និងឧបករណ៍ការងារ មិនរាប់ទេ។",
        "អត្រា គឺ ២,៥% (មួយភាគសែសិប)។ ឧទាហរណ៍៖ ទ្រព្យ ១០.០០០ ដុល្លារ ដែលគ្រប់នីសាប និងគ្រប់ហាវល៍ → ហ្សាកាត់ ២៥០ ដុល្លារ។",
        "ហ្សាកាត់ចែកឲ្យតែប្រាំបីក្រុមដែលគម្ពីរបានកំណត់ (At-Tawbah ៩:៦០) ដូចជា អ្នកក្រ អ្នកខ្វះខាត និងអ្នកជំពាក់បំណុល។ ម៉ាស៊ីនគណនាហ្សាកាត់ក្នុង អេប លុយឆ្លាត គណនាជូនពីកាបូប មាស និងបំណុលរបស់អ្នក — ជាការប៉ាន់ស្មាន សូមបញ្ជាក់ជាមួយអ៊ីម៉ាម ឬលោកគ្រូ។",
      ],
      en: [
        "Zakat purifies wealth (At-Tawbah 9:103). It is due when two conditions are met: the wealth reaches the nisab, and it has been held for a full lunar year (hawl).",
        "Nisab = 20 dinars ≈ 85 g of pure gold (or 595 g of silver), valued at today's price. Below the nisab, no zakat is due yet.",
        "What counts: cash in hand and in the bank, gold, silver, goods for sale and investments. The home you live in, your car and your work tools do not.",
        "The rate is 2.5% (one fortieth). For example: $10,000 above the nisab, held for a hawl → $250 of zakat.",
        "Zakat goes only to the eight groups the Quran names (At-Tawbah 9:60), such as the poor, the needy and those in debt. App Luy Chlat's zakat calculator works it out from your wallets, gold and debts — an estimate; please confirm it with an Imam or teacher.",
      ],
    },
    citations: [quran("At-Tawbah", 9, "103"), hadith("Sunan Abi Dawud 1573", "abudawud:1573"), hadith("Sahih al-Bukhari 1454", "bukhari:1454"), quran("At-Tawbah", 9, "60")],
    quizIds: ["zakat-rate", "zakat-hawl", "zakat-nisab-gold", "zakat-recipients"],
    reviewedBy: null,
  },
]

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id) ?? null
export const lessonsInModule = (module: ModuleId) => LESSONS.filter((l) => l.module === module)
export const quizzesFor = (lesson: Lesson): IslamicQuiz[] => lesson.quizIds.map((id) => ISLAMIC_QUIZZES.find((q) => q.id === id)).filter((q): q is IslamicQuiz => Boolean(q))

/** Only lessons a local Imam or teacher has read — the app never shows religious teaching on its own word. */
export const publishedLessons = (lessons: Lesson[] = LESSONS) => lessons.filter((l) => Boolean(l.reviewedBy?.trim()))

/** Reading time in minutes (≈ 180 English words a minute; Khmer has no spaces, so its length is read by characters). */
export function readMinutes(lesson: Lesson, locale: "km" | "en"): number {
  if (locale === "en") return Math.max(1, Math.round(lesson.body.en.join(" ").split(/\s+/).length / 180))
  return Math.max(1, Math.round(lesson.body.km.join("").length / 700))
}
