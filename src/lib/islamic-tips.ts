/**
 * Islamic financial and life ethics — the daily tip when Islamic Mode is on (founder, 18/10/2026): recording
 * debts, fair trade, avoiding interest, charity and avoiding waste, for Cambodian shops and families. Every
 * tip names its source exactly (Surah:Ayah, or the hadith in Sahih al-Bukhari / Sahih Muslim, sunnah.com
 * numbering). The Khmer and English lines give the meaning, not the Quran itself — to be checked with a local
 * Imam (as lib/scripture.ts). Pure (islamic-tips.test.ts).
 */
import * as G from "@/lib/islamic/glossary"
import type { Tip } from "@/lib/tips"

/**
 * `poster`: the lesson on its graphic (founder, 20/10/2026 — lesson 13 repeated its title and lost the advice): the
 * religious principle (white), then the practical money takeaway (gold) — saving, debts, budgets, honest trade —
 * each one sentence, together at most three lines, no parentheses. The whole lesson stays in the caption.
 */
export type IslamicTip = Tip & {
  ref: { label: string; url: string }
  poster: { principle: string; takeaway: string }
  /**
   * A lesson told in the Prophet's own words (founder, 21/10/2026 — Yerny's review of lesson 14: a generic money line
   * had replaced what he ﷺ said). The poster quotes him — the intro (white), his words, the du'a (gold) — and the
   * caption carries the reviewer's full translation, verbatim ("" = a blank line).
   */
  hadith?: { intro: string; quote: string; dua: string; caption: string[] }
  /**
   * The story behind the ayah (Asbab al-Nuzul) and its hadith, as the Islamic advisor Nuryerny Ahmad standardised it
   * (founder, 24/10/2026 — Task #485: the post showed the bare ayah). The caption carries it verbatim ("" = a blank line),
   * then the lesson's core message and its reference; the poster keeps the principle and the takeaway.
   */
  story?: {
    caption: string[]
    /**
     * Drafted by the engineering team, not yet reviewed by the Islamic advisor (founder, 25/10/2026 — Task #500): the
     * approval card says so and names the reviewers; set to false (or removed) once Nuryerny Ahmad has approved it.
     */
    draft?: boolean
  }
}

const quran = (surah: string, s: number, a: number) => ({ label: `${surah} ${s}:${a}`, url: `https://quran.com/${s}/${a}` })
const bukhari = (n: number) => ({ label: `Sahih al-Bukhari ${n}`, url: `https://sunnah.com/bukhari:${n}` })
const muslim = (n: number) => ({ label: `Sahih Muslim ${n}`, url: `https://sunnah.com/muslim:${n}` })

export const ISLAMIC_TIPS: IslamicTip[] = [
  {
    id: "isl-write-debt",
    topic: "islamic",
    poster: { principle: "អល់ឡោះបង្គាប់ឱ្យកត់ត្រាបំណុល ដើម្បីរក្សាយុត្តិធម៌។", takeaway: "ខ្ចី ឬឱ្យខ្ចីលុយ ចូរកត់ត្រាចំនួន ថ្ងៃខ្ចី និងថ្ងៃសង ហើយមានសាក្សី។" },
    title: { km: "កត់ត្រាបំណុលជានិច្ច", en: "Write every debt down" },
    body: {
      km: "ពេលខ្ចី ឬឱ្យខ្ចីលុយ ទោះតិចឬច្រើន ចូរកត់ត្រាចំនួន ថ្ងៃខ្ចី និងថ្ងៃសង ហើយមានសាក្សី។ អល់ឡោះបានបង្គាប់ឱ្យកត់ត្រាបំណុល ដើម្បីរក្សាភាពយុត្តិធម៌ និងទំនាក់ទំនងល្អ។",
      en: "Whenever you lend or borrow, big or small, write down the amount, the date and when it is due, with a witness. Allah commands debts to be written — it keeps both fairness and the friendship.",
    },
    ref: quran("Al-Baqarah", 2, 282),
  },
  {
    id: "isl-trade-not-riba",
    topic: "islamic",
    poster: { principle: "អល់ឡោះអនុញ្ញាតការជួញដូរ ហើយហាមឃាត់ការប្រាក់។", takeaway: "មុនខ្ចីលុយពង្រីកហាង ចូរស្វែងរកជម្រើសគ្មានការប្រាក់ ដូចជាការចែករំលែកប្រាក់ចំណេញ។" },
    title: { km: "ជួញដូរ ហាឡាល់ — ការប្រាក់ ហារ៉ាម", en: "Trade is lawful — interest is not" },
    body: {
      km: "អល់ឡោះអនុញ្ញាតការជួញដូរ ហើយហាមឃាត់ការប្រាក់ ឬ «រីបា»។ មុនខ្ចីលុយមកពង្រីកហាង ចូរស្វែងរកជម្រើសគ្មានការប្រាក់ ដូចជាការចែករំលែកប្រាក់ចំណេញ ឬការខ្ចីដោយគ្មានការប្រាក់។",
      en: "Allah has permitted trade and forbidden interest (riba). Before borrowing to grow your shop, look for interest-free options such as profit-sharing or an interest-free loan.",
    },
    ref: quran("Al-Baqarah", 2, 275),
  },
  {
    id: "isl-respite",
    topic: "islamic",
    poster: { principle: "បើអ្នកជំពាក់ពិតជាជួបការលំបាក ចូរពន្យារពេលឱ្យគេ។", takeaway: "ទុកពេលឱ្យគេសងតាមលទ្ធភាព ហើយបើលើកលែងបំណុលជាទាន រឹតតែប្រសើរ។" },
    title: { km: "ផ្តល់ពេលដល់អ្នកជំពាក់ដែលជួបការលំបាក", en: "Give time to a debtor in hardship" },
    body: {
      km: "បើអតិថិជន ឬញាតិមិត្តជំពាក់អ្នក ហើយពិតជាជួបការលំបាក ចូរពន្យារពេលឱ្យគេរហូតដល់គេមានលទ្ធភាព។ ហើយបើអ្នកលើកលែងបំណុលនោះជាទាន វារឹតតែប្រសើរ។",
      en: "If a customer or relative owes you and is truly in hardship, give them time until they are able. And if you forgive it as charity, that is better still.",
    },
    story: {
      caption: [
        "",
        "📖 ដំណើររឿងប្រវត្តិ (ដំណើរដើមទងនៃអាយ៉ាត់ និង ហាទីស)៖",
        "នៅសម័យព្យាការី ﷺ ត្រកូលម្ចាស់បំណុលបានទារប្រាក់បន្ថែមពីត្រកូលកូនបំណុលដែលកំពុងជួបវិបត្តិជីវភាពធ្ងន់ធ្ងរ។ ព្រះអល់ឡោះបានបញ្ចុះអាយ៉ាត់នេះដើម្បីបញ្ឈប់ការជិះជាន់ និងបង្គាប់ឱ្យមេត្តាធម៌៖ «ប្រសិនបើគេជួបការលំបាក ចូរពន្យារពេលឱ្យគេ រហូតដល់គេមានលទ្ធភាពសង ហើយបើលើកលែងបំណុលជាទាន រឹតតែប្រសើរ»។",
        "",
        "ព្យាការី Muhammad ﷺ បានមានបន្ទូលថា៖",
        "«អ្នកណាដែលចង់ឱ្យអល់ឡោះផ្ដល់ម្លប់ការពារខ្លួននៅថ្ងៃបរលោក ចូរជួយសម្រាល ឬលើកលែងបំណុលដល់អ្នកដែលកំពុងទ័លច្រក» (Sahih Muslim)។",
        "",
        "«ទុកពេលឱ្យគេសងតាមលទ្ធភាព",
        "ហើយបើលើកលែងបំណុលជាទាន រឹតតែប្រសើរ។»",
        "(ស៊ូរ៉ាត់ Al-Baqarah: អាយ៉ាត់ 280)",
      ],
    },
    ref: quran("Al-Baqarah", 2, 280),
  },
  {
    id: "isl-pay-on-time",
    topic: "islamic",
    poster: { principle: "ពន្យារការសងបំណុល ពេលមានលទ្ធភាពសង គឺជាអំពើអយុត្តិធម៌។", takeaway: "ដាក់ថ្ងៃសងក្នុង អេប លុយឆ្លាត ហើយសងឱ្យទាន់ពេលរាល់ខែ។" },
    title: { km: "មានលុយហើយ កុំពន្យារការសងបំណុល", en: "Able to pay? Don't delay" },
    body: {
      km: "ការពន្យារការសងបំណុល ពេលខ្លួនមានលទ្ធភាពសងហើយ គឺជាអំពើអយុត្តិធម៌។ ដាក់ថ្ងៃសងក្នុង អេប លុយឆ្លាត ហើយសងឱ្យទាន់ពេល។",
      en: "Delaying a debt when you are able to pay it is injustice. Put the due date in App Luy Chlat and pay on time.",
    },
    // The story behind the hadith (founder, 25/10/2026 — Task #498): the funeral of a man who died in debt, from the
    // same book of Sahih al-Bukhari (Hawalat, 2289 — Salama bin al-Akwa'), in Nuryerny Ahmad's format.
    story: {
      draft: true,
      caption: [
        "",
        "📖 ដំណើររឿងប្រវត្តិ (ដំណើរដើមទងនៃហាទីស)៖",
        "នៅសម័យព្យាការី ﷺ មានគេយកសពបុរសម្នាក់មក ហើយសុំឱ្យព្យាការីសឡាតសព (Janazah) ឱ្យគាត់។ ព្យាការីសួរថា «តើគាត់ជំពាក់បំណុលគេទេ?» គេឆ្លើយថា «ជំពាក់បីឌីណារ ហើយគ្មានទ្រព្យសល់សងទេ»។ ព្យាការីមានប្រសាសន៍ថា «ចូរអ្នករាល់គ្នាសឡាតសពមិត្តរបស់អ្នកចុះ»។ Abu Qatada ក៏និយាយថា «ឱ ព្យាការីរបស់អល់ឡោះ! សូមសឡាតឱ្យគាត់ ខ្ញុំនឹងសងបំណុលនោះជំនួស» ទើបព្យាការី ﷺ សឡាតសពឱ្យគាត់ (Sahih al-Bukhari 2289)។",
        "",
        "ព្យាការី Muhammad ﷺ បានមានបន្ទូលថា៖",
        "«ការពន្យារការសងបំណុល ដោយអ្នកដែលមានលទ្ធភាពសង គឺជាអំពើអយុត្តិធម៌» (Sahih al-Bukhari 2287)។",
        "",
        "💡 មេរៀនហិរញ្ញវត្ថុ៖ មានលុយហើយ ចូរសងឱ្យទាន់ពេល — ដាក់ថ្ងៃសងក្នុង អេប លុយឆ្លាត កុំទុកបំណុលឱ្យនៅជាប់ខ្លួន។",
      ],
    },
    ref: bukhari(2287),
  },
  {
    id: "isl-honest-trade",
    topic: "islamic",
    poster: { principle: "ការលក់ដូរដោយនិយាយការពិត នាំមកនូវពរជ័យ។", takeaway: "ប្រាប់ចំណុចខ្វះខាតរបស់ទំនិញដោយត្រង់ៗ អតិថិជននឹងជឿទុកចិត្ត ហើយត្រឡប់មកទិញទៀត។" },
    title: { km: "លក់ដូរដោយស្មោះត្រង់", en: "Sell with honesty" },
    body: {
      km: "អ្នកទិញ និងអ្នកលក់ដែលនិយាយការពិត ហើយប្រាប់ចំណុចខ្វះខាតរបស់ទំនិញដោយត្រង់ៗ នឹងទទួលបានពរជ័យក្នុងការជួញដូរ។ ការកុហក និងលាក់កំហុសទំនិញ ធ្វើឱ្យពរជ័យនោះបាត់បង់។",
      en: "When buyer and seller speak the truth and openly state any defect, their trade is blessed. Lying and hiding a defect wipe the blessing away.",
    },
    // The story behind the hadith (founder, 25/10/2026 — Task #500, a draft for Nuryerny Ahmad): its narrator Hakim ibn
    // Hizam, a Makkan merchant and Khadijah's nephew, and his own question on trade (Sunan Abi Dawud 3503).
    story: {
      draft: true,
      caption: [
        "",
        "📖 ដំណើររឿងប្រវត្តិ (ដំណើរដើមទងនៃហាទីស)៖",
        "Hakim ibn Hizam ជាពាណិជ្ជករល្បីនៅទីក្រុងម៉ាក្កះ និងជាក្មួយរបស់លោកស្រី Khadijah។ ថ្ងៃមួយគាត់បានសួរព្យាការី ﷺ ថា «មានអ្នកមកសុំទិញទំនិញដែលខ្ញុំមិនទាន់មាន តើខ្ញុំអាចលក់ឱ្យគេសិន ហើយទៅទិញពីផ្សារមកឱ្យគេបានទេ?» ព្យាការី ﷺ មានប្រសាសន៍ថា «កុំលក់អ្វីដែលអ្នកមិនទាន់មាន» (Sunan Abi Dawud 3503)។ ហាទីសខាងក្រោម ក៏ជាការរាយការណ៍របស់ Hakim ដែរ។",
        "",
        "ព្យាការី Muhammad ﷺ បានមានបន្ទូលថា៖",
        "«បើអ្នកទិញ និងអ្នកលក់និយាយការពិត ហើយប្រាប់ចំណុចខ្វះខាតដោយត្រង់ៗ ការលក់ដូររបស់ពួកគេនឹងមានពរជ័យ។ តែបើពួកគេកុហក ហើយលាក់បាំង ពរជ័យនៃការលក់ដូរនោះនឹងត្រូវលុបបាត់» (Sahih al-Bukhari 2079)។",
        "",
        "💡 មេរៀនហិរញ្ញវត្ថុ៖ ប្រាប់ចំណុចខ្វះខាតរបស់ទំនិញដោយត្រង់ៗ ហើយកុំសន្យាលក់ទំនិញដែលមិនទាន់មានក្នុងដៃ — ទំនុកចិត្តរបស់អតិថិជន គឺជាប្រាក់ចំណេញយូរអង្វែង។",
      ],
    },
    ref: bukhari(2079),
  },
  {
    id: "isl-no-cheating",
    topic: "islamic",
    poster: { principle: "អ្នកណាបោកប្រាស់ មិនមែនជាពួកយើងទេ។", takeaway: "កុំដាក់ទំនិញល្អខាងមុខ ហើយលាក់ទំនិញខូចខាងក្រោយ ភាពស្មោះត្រង់គឺជាដើមទុនរបស់ហាង។" },
    title: { km: "កុំបោកប្រាស់អតិថិជន", en: "Never cheat a customer" },
    body: {
      km: `${G.PROPHET_FULL} បានឃើញគំនរអាហារដែលសើមនៅខាងក្រោម ហើយមានប្រសាសន៍ថា អ្នកណាបោកប្រាស់ មិនមែនជាពួកយើងទេ។ ទំនិញល្អដាក់ខាងមុខ ទំនិញខូចលាក់ខាងក្រោយ — កុំធ្វើ។`,
      en: "The Prophet ﷺ found a pile of food wet underneath and said: whoever cheats is not one of us. Good goods on top, spoiled ones hidden below — never.",
    },
    // The story of the hadith itself (founder, 25/10/2026 — Task #500, a draft for Nuryerny Ahmad): the heap of food
    // wet underneath, as Abu Hurairah reported it (Sahih Muslim 102).
    story: {
      draft: true,
      caption: [
        "",
        "📖 ដំណើររឿងប្រវត្តិ (ដំណើរដើមទងនៃហាទីស)៖",
        "Abu Hurairah បានរាយការណ៍ថា៖ ព្យាការី ﷺ បានដើរកាត់គំនរស្បៀងអាហារមួយ ហើយលូកដៃចូលក្នុងគំនរនោះ ឃើញម្រាមដៃសើម។ ព្យាការីសួរថា «ម្ចាស់ស្បៀង! នេះជាអ្វី?» គាត់ឆ្លើយថា «ត្រូវទឹកភ្លៀង ឱ ព្យាការីរបស់អល់ឡោះ»។ ព្យាការីមានប្រសាសន៍ថា «ហេតុអ្វីមិនដាក់វានៅខាងលើ ដើម្បីឱ្យមនុស្សឃើញ?»",
        "",
        "ព្យាការី Muhammad ﷺ បានមានបន្ទូលថា៖",
        "«អ្នកណាបោកប្រាស់ អ្នកនោះមិនមែនជាពួកយើងទេ» (Sahih Muslim 102)។",
        "",
        "💡 មេរៀនហិរញ្ញវត្ថុ៖ កុំដាក់ទំនិញល្អនៅខាងមុខ ហើយលាក់ទំនិញខូចនៅខាងក្រោយ — បង្ហាញទំនិញតាមស្ថានភាពពិត ភាពស្មោះត្រង់គឺជាដើមទុនរបស់ហាង។",
      ],
    },
    ref: muslim(102),
  },
  {
    id: "isl-full-measure",
    topic: "islamic",
    poster: { principle: "ចូរថ្លឹង និងវាស់ឱ្យគ្រប់ ដោយជញ្ជីងត្រឹមត្រូវ។", takeaway: "ការថ្លឹងត្រឹមត្រូវ ធ្វើឱ្យអតិថិជនជឿទុកចិត្ត និងទិញពីហាងអ្នកយូរអង្វែង។" },
    title: { km: "ថ្លឹង និងវាស់ឱ្យគ្រប់", en: "Give full weight and measure" },
    body: {
      km: "ពេលថ្លឹងសាច់ ថ្លឹងអង្ករ ឬវាស់ទំនិញ ចូរថ្លឹងឱ្យគ្រប់ ដោយជញ្ជីងត្រឹមត្រូវ។ នេះជាការល្អ ហើយនាំឱ្យអតិថិជនជឿទុកចិត្តយូរអង្វែង។",
      en: "When you weigh meat or rice or measure goods, give full measure on an honest scale. It is good, and it earns customers' trust for years.",
    },
    ref: quran("Al-Isra", 17, 35),
  },
  {
    id: "isl-sadaqah-wealth",
    topic: "islamic",
    poster: { principle: "ការធ្វើទាន មិនធ្វើឱ្យទ្រព្យរបស់អ្នកថយចុះឡើយ។", takeaway: "កំណត់ថវិកាទានតិចៗរៀងរាល់សប្តាហ៍ ក្នុងផែនការចំណាយរបស់អ្នក។" },
    title: { km: "ទានមិនធ្វើឱ្យទ្រព្យថយចុះ", en: "Charity never lessens wealth" },
    body: {
      km: "ការចែករំលែកដល់អ្នកខ្វះខាត មិនធ្វើឱ្យទ្រព្យរបស់អ្នកថយចុះឡើយ។ សូម្បីតែទានតិចតួចរៀងរាល់សប្តាហ៍ ក៏មានតម្លៃខ្ពស់ដែរ។",
      en: "Giving to those in need never lessens your wealth. Even a small gift every week is of great worth.",
    },
    ref: muslim(2588),
  },
  {
    id: "isl-sadaqah-seed",
    topic: "islamic",
    poster: { principle: "ទានក្នុងមាគ៌ាអល់ឡោះ ប្រៀបដូចគ្រាប់ពូជដែលដុះជាប្រាំពីររយគ្រាប់។", takeaway: "ទុកថវិកាទានមួយផ្នែកពីចំណូលរៀងរាល់ខែ មុនពេលចាយលើអ្វីផ្សេង។" },
    title: { km: "ទានប្រៀបដូចគ្រាប់ពូជ", en: "Charity is like a seed" },
    body: {
      km: "ទានក្នុងមាគ៌ាអល់ឡោះ ប្រៀបដូចគ្រាប់ពូជមួយ ដុះចេញជាប្រាំពីរកួរ ហើយកួរនីមួយៗមានមួយរយគ្រាប់។ ចូរទុកថវិកាទានមួយផ្នែកពីចំណូលរៀងរាល់ខែ។",
      en: "Spending in Allah's way is like a seed that grows seven ears, each with a hundred grains. Set aside a part of each month's income for charity.",
    },
    ref: quran("Al-Baqarah", 2, 261),
  },
  {
    id: "isl-no-waste",
    topic: "islamic",
    poster: { principle: "ចូរហូប និងផឹក តែកុំខ្ជះខ្ជាយ។", takeaway: "មុនទិញអ្វីមួយ សួរខ្លួនឯងថា តើខ្ញុំត្រូវការវាពិតមែនឬ?" },
    title: { km: "ហូប និងចាយ តែកុំខ្ជះខ្ជាយ", en: "Eat and spend — but don't waste" },
    body: {
      km: "ចូរហូប និងផឹក តែកុំហួសហេតុ — អល់ឡោះមិនស្រឡាញ់អ្នកខ្ជះខ្ជាយឡើយ។ មុនទិញអ្វីមួយ សួរខ្លួនឯងថា «តើខ្ញុំត្រូវការវាពិតមែនឬ?»",
      en: "Eat and drink, but do not go to excess — Allah does not love the wasteful. Before you buy, ask yourself: «Do I really need it?»",
    },
    ref: quran("Al-A'raf", 7, 31),
  },
  {
    id: "isl-balance",
    topic: "islamic",
    poster: { principle: "កុំចាយហួសហេតុ ហើយក៏កុំកំណាញ់ ចូរនៅចំកណ្តាល។", takeaway: "ធ្វើថវិកាប្រចាំខែ ដើម្បីរក្សាតុល្យភាពរវាងការចាយ និងការសន្សំ។" },
    title: { km: "ចាយដោយសមរម្យ", en: "Spend in balance" },
    body: {
      km: "អ្នកមានគុណធម៌ គឺអ្នកដែលចាយមិនហួសហេតុ ហើយក៏មិនកំណាញ់ដែរ គឺនៅចំកណ្តាល។ ធ្វើថវិកាប្រចាំខែ ដើម្បីរក្សាតុល្យភាពនេះ។",
      en: "The virtuous spend neither wastefully nor stingily, but in between. A monthly budget keeps that balance.",
    },
    ref: quran("Al-Furqan", 25, 67),
  },
  {
    id: "isl-own-hands",
    topic: "islamic",
    poster: { principle: "គ្មានអាហារណាល្អជាងអាហារពីកម្លាំងដៃខ្លួនឯងឡើយ។", takeaway: "ការងារស្មោះត្រង់ ទោះតូចក៏ដោយ គឺជាកិត្តិយស និងជាចំណូលហាឡាល់។" },
    title: { km: "ចំណូលពីកម្លាំងដៃខ្លួនឯង", en: "Earn by your own hands" },
    body: {
      km: "គ្មានអាហារណាល្អជាងអាហារដែលបានមកពីកម្លាំងដៃខ្លួនឯងឡើយ — ព្យាការីដាវូដក៏ហូបពីការងារដៃខ្លួនឯងដែរ។ ការងារស្មោះត្រង់ ទោះតូចក៏ដោយ គឺជាកិត្តិយស។",
      en: "No one eats better food than what they earn with their own hands — the Prophet Dawud ate from the work of his hands. Honest work, however small, is an honour.",
    },
    ref: bukhari(2072),
  },
  {
    id: "isl-upper-hand",
    topic: "islamic",
    poster: { principle: "ដៃដែលផ្តល់ឱ្យ ប្រសើរជាងដៃដែលទទួល។", takeaway: "សន្សំ និងគ្រប់គ្រងលុយឱ្យល្អ ដើម្បីកុំឱ្យពឹងអ្នកដទៃ ហើយថែមទាំងអាចជួយគេបានទៀតផង។" },
    title: { km: "ដៃខាងលើ ប្រសើរជាងដៃខាងក្រោម", en: "The upper hand is better" },
    body: {
      km: "ដៃដែលផ្តល់ឱ្យ ប្រសើរជាងដៃដែលទទួល។ សន្សំ និងគ្រប់គ្រងលុយឱ្យល្អ ដើម្បីកុំឱ្យពឹងអ្នកដទៃ ហើយថែមទាំងអាចជួយគេបានទៀតផង។",
      en: "The hand that gives is better than the hand that takes. Save and manage your money well, so you need no one — and can help others.",
    },
    ref: bukhari(1429),
  },
  {
    // Lesson 14 in the Prophet's own words — the translation verified by Yerny (Islamic reviewer, 21/10/2026) from
    // sunnah.com; the generic line «ខ្ចីតែពេលចាំបាច់ …» is gone (it was never his words).
    id: "isl-avoid-debt",
    topic: "islamic",
    poster: { principle: `${G.PROPHET_FULL} តែងសុំការការពារពីបំណុល។`, takeaway: "បំណុលអាចបំផ្លាញទាំងកិត្តិយស ភាពស្មោះត្រង់ និងសច្ចភាពរបស់មនុស្ស។" },
    hadith: {
      intro: `${G.PROPHET_FULL} មានប្រសាសន៍ថា៖`,
      quote: "«នៅពេលដែលមនុស្សម្នាក់ជំពាក់បំណុលគេ គាត់តែងតែនិយាយកុហកនៅពេលនិយាយ ហើយតែងតែមិនគោរពតាមពាក្យសន្យានៅពេលដែលគាត់បានសន្យា។»",
      dua: "«ឱ អល់ឡោះ! ទូលបង្គំសូមជ្រកកោននឹងទ្រង់ ឱ្យរួចផុតពីអំពើបាប និងការជំពាក់បំណុលគេ»",
      caption: [
        "",
        "លោកស្រី Aisha (សូមអល់ឡោះពេញចិត្តនឹងលោកស្រី) បានរាយការណ៍ថា៖ ព្យាការីរបស់អល់ឡោះ ﷺ ធ្លាប់អង្វរអំពាវនាវនៅក្នុងការថ្វាយបង្គំថា៖",
        "« ឱ អល់ឡោះ! ខ្ញុំសូមជ្រកកោននឹងទ្រង់ ឱ្យរួចផុតពីអំពើបាបទាំងឡាយ និងពីការជំពាក់បំណុលគេ។ »",
        "",
        "មានបុរសម្នាក់បានសួរថា៖ « ឱ ព្យាការីរបស់អល់ឡោះ! ខ្ញុំសង្កេតឃើញថាលោកតែងតែសុំការការពារពីអល់ឡោះ ឱ្យរួចផុតពីការជំពាក់បំណុលគេ ជាញឹកញាប់ណាស់? »",
        "",
        "លោក ﷺ បានឆ្លើយតបថា៖",
        "« នៅពេលដែលមនុស្សម្នាក់ជំពាក់បំណុលគេ គាត់តែងតែនិយាយកុហកនៅពេលនិយាយ ហើយតែងតែមិនគោរពតាមពាក្យសន្យា នៅពេលដែលគាត់បានសន្យាអ្វីមួយ។ »",
        "",
        "💡 មេរៀនហិរញ្ញវត្ថុ៖ បំណុលមិនត្រឹមតែជាបន្ទុកលុយកាក់ប៉ុណ្ណោះទេ តែវាអាចបំផ្លាញទាំងកិត្តិយស ភាពស្មោះត្រង់ និងសច្ចភាពរបស់មនុស្សទៀតផង។",
      ],
    },
    title: { km: "គ្រោះថ្នាក់នៃការជំពាក់បំណុល", en: "The danger of debt" },
    body: {
      km: `${G.PROPHET_FULL} មានប្រសាសន៍ថា៖ «នៅពេលដែលមនុស្សម្នាក់ជំពាក់បំណុលគេ គាត់តែងតែនិយាយកុហកនៅពេលនិយាយ ហើយតែងតែមិនគោរពតាមពាក្យសន្យានៅពេលដែលគាត់បានសន្យា។» បំណុលមិនត្រឹមតែជាបន្ទុកលុយកាក់ប៉ុណ្ណោះទេ តែវាអាចបំផ្លាញទាំងកិត្តិយស ភាពស្មោះត្រង់ និងសច្ចភាពរបស់មនុស្សទៀតផង។`,
      en: "The Prophet ﷺ said: «When a person is in debt, he lies when he speaks and breaks his promises when he promises.» Debt is not only a burden on money — it can ruin a person's honour, honesty and truthfulness.",
    },
    ref: bukhari(2397),
  },
]

/**
 * The lesson carries its story context (founder, 25/10/2026 — Task #498, Nuryerny Ahmad's standard): the Asbab al-Nuzul
 * or the hadith's own story (`story`), or the Prophet's words with their narration (`hadith`). A lesson without it is
 * never posted to the channel (islamicPlannedPosts plans no card; publish refuses it).
 */
export const hasStoryContext = (tip: IslamicTip) => [...(tip.story?.caption ?? []), ...(tip.hadith?.caption ?? [])].some((l) => l.trim().length > 0)

/** Today's Islamic tip (the same for everyone on a day; «another tip» moves on by `offset`). */
export function islamicTipOfTheDay(dayNumber: number, offset = 0): IslamicTip {
  const n = ISLAMIC_TIPS.length
  return ISLAMIC_TIPS[(((dayNumber + offset) % n) + n) % n]
}
