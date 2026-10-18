/**
 * Islamic financial and life ethics — the daily tip when Islamic Mode is on (founder, 18/10/2026): recording
 * debts, fair trade, avoiding interest, charity and avoiding waste, for Cambodian shops and families. Every
 * tip names its source exactly (Surah:Ayah, or the hadith in Sahih al-Bukhari / Sahih Muslim, sunnah.com
 * numbering). The Khmer and English lines give the meaning, not the Quran itself — to be checked with a local
 * Imam (as lib/scripture.ts). Pure (islamic-tips.test.ts).
 */
import type { Tip } from "@/lib/tips"

export type IslamicTip = Tip & { ref: { label: string; url: string } }

const quran = (surah: string, s: number, a: number) => ({ label: `${surah} ${s}:${a}`, url: `https://quran.com/${s}/${a}` })
const bukhari = (n: number) => ({ label: `Sahih al-Bukhari ${n}`, url: `https://sunnah.com/bukhari:${n}` })
const muslim = (n: number) => ({ label: `Sahih Muslim ${n}`, url: `https://sunnah.com/muslim:${n}` })

export const ISLAMIC_TIPS: IslamicTip[] = [
  {
    id: "isl-write-debt",
    topic: "islamic",
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
    title: { km: "ជួញដូរ ហាឡាល់ — ការប្រាក់ ហារ៉ាម", en: "Trade is lawful — interest is not" },
    body: {
      km: "អល់ឡោះអនុញ្ញាតការជួញដូរ ហើយហាមឃាត់ការប្រាក់ (រីបា)។ មុនខ្ចីលុយមកពង្រីកហាង ចូរស្វែងរកជម្រើសគ្មានការប្រាក់ ដូចជាការចែករំលែកប្រាក់ចំណេញ ឬការខ្ចីដោយគ្មានការប្រាក់។",
      en: "Allah has permitted trade and forbidden interest (riba). Before borrowing to grow your shop, look for interest-free options such as profit-sharing or an interest-free loan.",
    },
    ref: quran("Al-Baqarah", 2, 275),
  },
  {
    id: "isl-respite",
    topic: "islamic",
    title: { km: "ផ្តល់ពេលដល់អ្នកជំពាក់ដែលជួបការលំបាក", en: "Give time to a debtor in hardship" },
    body: {
      km: "បើអតិថិជន ឬញាតិមិត្តជំពាក់អ្នក ហើយពិតជាជួបការលំបាក ចូរពន្យារពេលឱ្យគេរហូតដល់គេមានលទ្ធភាព។ ហើយបើអ្នកលើកលែងបំណុលនោះជាទាន វារឹតតែប្រសើរ។",
      en: "If a customer or relative owes you and is truly in hardship, give them time until they are able. And if you forgive it as charity, that is better still.",
    },
    ref: quran("Al-Baqarah", 2, 280),
  },
  {
    id: "isl-pay-on-time",
    topic: "islamic",
    title: { km: "មានលុយហើយ កុំពន្យារការសងបំណុល", en: "Able to pay? Don't delay" },
    body: {
      km: "ការពន្យារការសងបំណុល ពេលខ្លួនមានលទ្ធភាពសងហើយ គឺជាអំពើអយុត្តិធម៌។ ដាក់ថ្ងៃសងក្នុង អេប លុយឆ្លាត ហើយសងឱ្យទាន់ពេល។",
      en: "Delaying a debt when you are able to pay it is injustice. Put the due date in App Luy Chlat and pay on time.",
    },
    ref: bukhari(2287),
  },
  {
    id: "isl-honest-trade",
    topic: "islamic",
    title: { km: "លក់ដូរដោយស្មោះត្រង់", en: "Sell with honesty" },
    body: {
      km: "អ្នកទិញ និងអ្នកលក់ដែលនិយាយការពិត ហើយប្រាប់ចំណុចខ្វះខាតរបស់ទំនិញដោយត្រង់ៗ នឹងទទួលបានពរជ័យក្នុងការជួញដូរ។ ការកុហក និងលាក់កំហុសទំនិញ ធ្វើឱ្យពរជ័យនោះបាត់បង់។",
      en: "When buyer and seller speak the truth and openly state any defect, their trade is blessed. Lying and hiding a defect wipe the blessing away.",
    },
    ref: bukhari(2079),
  },
  {
    id: "isl-no-cheating",
    topic: "islamic",
    title: { km: "កុំបោកប្រាស់អតិថិជន", en: "Never cheat a customer" },
    body: {
      km: "ព្យាការី មូហាំម៉ាត់ ﷺ បានឃើញគំនរអាហារដែលសើមនៅខាងក្រោម ហើយមានប្រសាសន៍ថា អ្នកណាបោកប្រាស់ មិនមែនជាពួកយើងទេ។ ទំនិញល្អដាក់ខាងមុខ ទំនិញខូចលាក់ខាងក្រោយ — កុំធ្វើ។",
      en: "The Prophet ﷺ found a pile of food wet underneath and said: whoever cheats is not one of us. Good goods on top, spoiled ones hidden below — never.",
    },
    ref: muslim(102),
  },
  {
    id: "isl-full-measure",
    topic: "islamic",
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
    title: { km: "ដៃខាងលើ ប្រសើរជាងដៃខាងក្រោម", en: "The upper hand is better" },
    body: {
      km: "ដៃដែលផ្តល់ឱ្យ ប្រសើរជាងដៃដែលទទួល។ សន្សំ និងគ្រប់គ្រងលុយឱ្យល្អ ដើម្បីកុំឱ្យពឹងអ្នកដទៃ ហើយថែមទាំងអាចជួយគេបានទៀតផង។",
      en: "The hand that gives is better than the hand that takes. Save and manage your money well, so you need no one — and can help others.",
    },
    ref: bukhari(1429),
  },
  {
    id: "isl-avoid-debt",
    topic: "islamic",
    title: { km: "កុំជំពាក់បំណុលដោយមិនចាំបាច់", en: "Avoid unnecessary debt" },
    body: {
      km: "ព្យាការី មូហាំម៉ាត់ ﷺ តែងសុំការការពារពីអល់ឡោះ ពីបាបកម្ម និងពីបំណុល ព្រោះអ្នកជំពាក់បំណុល ងាយនិយាយកុហក និងមិនរក្សាការសន្យា។ ខ្ចីតែពេលចាំបាច់ ហើយមានផែនការសងច្បាស់លាស់។",
      en: "The Prophet ﷺ often sought Allah's protection from sin and from debt, for a person in debt is drawn to lie and to break promises. Borrow only when needed, with a clear plan to repay.",
    },
    ref: bukhari(2397),
  },
]

/** Today's Islamic tip (the same for everyone on a day; «another tip» moves on by `offset`). */
export function islamicTipOfTheDay(dayNumber: number, offset = 0): IslamicTip {
  const n = ISLAMIC_TIPS.length
  return ISLAMIC_TIPS[(((dayNumber + offset) % n) + n) % n]
}
