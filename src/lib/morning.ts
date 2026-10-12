/**
 * The 07:00 morning message — one source for the community channel post, the
 * phone push notification and the card in the in-app bell, so they always say
 * the same thing. Pure (morning.test.ts).
 */

/**
 * 31 money sayings (original), one per day of the month by the Cambodian date — never the same two
 * days running (founder, 12/10/2026). Day 31 of a 30-day month simply never shows the last one.
 */
export const MORNING_QUOTES: readonly string[] = [
  "ស្រឡាញ់លុយ លុយនឹងស្រឡាញ់អ្នកវិញ! ចាប់ផ្តើមថ្ងៃថ្មីដោយកត់ត្រារាល់ចំណូល-ចំណាយឱ្យបានត្រឹមត្រូវ។",
  "លុយតិចៗ បើសន្សំរាល់ថ្ងៃ ក៏ក្លាយជាលុយច្រើនដែរ។",
  "ដឹងថាលុយចេញទៅណា ទើបដឹងថាត្រូវកាត់ចំណាយត្រង់ណា។",
  "ទុកលុយសន្សំមុន ចាយលុយដែលនៅសល់ពីក្រោយ — មិនមែនចាយសិន សល់ទើបសន្សំទេ។",
  "បំណុលដែលបង់ទាន់ពេល ការពារកេរ្តិ៍ឈ្មោះ និងពិន្ទុឥណទានរបស់អ្នក។",
  "ទិញព្រោះត្រូវការ មិនមែនព្រោះចង់បាន។",
  "ប្រាក់បម្រុងសង្គ្រោះបន្ទាន់ ៣ ទៅ ៦ ខែ ជួយឱ្យអ្នកគេងលក់ ពេលមានរឿងមិននឹកស្មានដល់។",
  "កត់ត្រា ១ នាទីរាល់ថ្ងៃ ប្រសើរជាងស្ដាយក្រោយពេញមួយខែ។",
  "ពេលចំណូលកើនឡើង កុំឱ្យចំណាយកើនឡើងតាម។",
  "មុននឹងខ្ចីលុយ សួរខ្លួនឯងថា «តើវាជួយបង្កើតចំណូលឱ្យខ្ញុំដែរឬទេ?»",
  "ទ្រព្យសម្បត្តិពិត គឺអ្វីដែលអ្នកនៅសល់ មិនមែនអ្វីដែលអ្នករកបាននោះទេ។",
  "កុំប្រៀបធៀបខ្លួនឯងនឹងអ្នកដទៃ — ប្រៀបធៀបនឹងខ្លួនឯងកាលពីខែមុន។",
  "ផែនការថវិកាល្អ មិនមែនដើម្បីហាមការចាយទេ គឺដើម្បីចាយលើអ្វីដែលសំខាន់។",
  "អាជីវកម្មតូច បើលំហូរសាច់ប្រាក់ច្បាស់ ក៏រីកចម្រើនបានយូរ។",
  "ចាយតិចជាងអ្វីដែលរកបាន — រឿងសាមញ្ញ តែជាគន្លឹះធំបំផុតនៃភាពសម្បូរ។",
  "បង់ថ្លៃភ្លើង ទឹក និងកម្ចីឱ្យទាន់ពេល ដើម្បីជៀសវាងការផាកពិន័យដែលមិនចាំបាច់។",
  "ឱ្យលុយធ្វើការឱ្យអ្នក ជាជាងអ្នកធ្វើការដើម្បីលុយតែម្យ៉ាង។",
  "សន្សំសម្រាប់គោលដៅច្បាស់លាស់ ធ្វើឱ្យការសន្សំមានន័យ និងងាយធ្វើ។",
  "បំបែកលុយអាជីវកម្ម និងលុយគ្រួសារ ដើម្បីដឹងចំណេញពិតប្រាកដ។",
  "ការវិនិយោគល្អបំផុត គឺការវិនិយោគលើចំណេះដឹងរបស់ខ្លួនឯង។",
  "មុនទិញរបស់ធំ ទុកពេល ២៤ ម៉ោងសិន — ចិត្តស្ងប់ ទើបសម្រេចចិត្តត្រូវ។",
  "ពិនិត្យសមតុល្យរៀងរាល់សប្ដាហ៍ កុំឱ្យលុយបាត់ដោយមិនដឹងខ្លួន។",
  "ចំណាយតូចៗរាល់ថ្ងៃ បូកគ្នាជាចំនួនធំនៅចុងខែ។",
  "សន្សំទុកឱ្យកូន គឺជាកាដូដ៏មានតម្លៃបំផុតសម្រាប់អនាគតរបស់គេ។",
  "ការប្រុងប្រយ័ត្នថ្ងៃនេះ គឺសេរីភាពហិរញ្ញវត្ថុនៅថ្ងៃស្អែក។",
  "កុំដាក់ពងមាន់ទាំងអស់ក្នុងកន្ត្រកតែមួយ — បែងចែកការសន្សំ និងការវិនិយោគ។",
  "ចំណូលបន្ថែម ទោះតិចក៏ដោយ គឺជាជំហានឆ្ពោះទៅរកភាពមាំមួន។",
  "ពេលលុយចូលដៃ ចែកភ្លាម៖ ផ្នែកសន្សំ ផ្នែកចាយ និងផ្នែកធ្វើបុណ្យ។",
  "ស្គាល់ចំណាយថេររបស់ខ្លួនឯង ទើបដឹងថាត្រូវរកប៉ុន្មានជាអប្បបរមា។",
  "ភាពស្មោះត្រង់ជាមួយលុយរបស់ខ្លួនឯង ចាប់ផ្តើមពីការកត់ត្រាដោយត្រឹមត្រូវ។",
  "ចុងខែនេះ អរគុណខ្លួនឯងដែលបានព្យាយាម — ខែក្រោយនឹងធ្វើបានល្អជាងនេះទៀត។",
] as const

/** Today's quote for a Cambodian date (YYYY-MM-DD): the day of the month picks it. */
export const morningQuote = (day: string) => MORNING_QUOTES[(Number(day.slice(8, 10)) - 1) % MORNING_QUOTES.length]

/** 07:00 Cambodia time (UTC+7 all year). */
export const MORNING_MINUTE = 7 * 60

export const APP_URL = "https://app.luychlat.com"

/** The phone notification. */
export function morningPush(day: string): { title: string; body: string; url: string; tag: string } {
  return {
    title: "☀️ អរុណសួស្តីពី អេប លុយឆ្លាត",
    body: `${morningQuote(day)} — ចុចដើម្បីកត់ត្រាចំណូល-ចំណាយថ្ងៃថ្មី!`,
    url: APP_URL,
    // One per day on the phone: a second send replaces it instead of piling up.
    tag: "luychlat-morning",
  }
}

/** Cambodia's date and minute of the day for a moment (ms since epoch). */
export function phnomPenhClock(now: number): { day: string; minute: number } {
  const t = new Date(now + 7 * 3_600_000)
  return { day: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

/** The bell's morning card: from 07:00 Cambodia time, for today; its time is today's 07:00. */
export function morningCard(now: number): { day: string; at: string } | null {
  const { day, minute } = phnomPenhClock(now)
  if (minute < MORNING_MINUTE) return null
  return { day, at: new Date(Date.parse(`${day}T07:00:00+07:00`)).toISOString() }
}
