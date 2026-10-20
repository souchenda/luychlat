/**
 * Cambodia's national days, royal ceremonies and international days (founder, 20/10/2026 — «LuyChlat was silent on
 * 15 October»): each one becomes a commemoration poster, previewed in «LCA Approval» 48 hours before at 08:00 and
 * published at 05:00 on the day to the community channel and the Page — only with an approver's tap (ZERO UNAPPROVED
 * PUBLIC POSTS). Pure (cambodia-holidays.test.ts).
 *
 * Fixed days by month-day; the lunar days (Khmer New Year, Visak Bochea, the Royal Ploughing, the Water Festival) from
 * lib/holidays.ts — the dates of the official sub-decree for each year. Pchum Ben keeps its own poster and holy-day
 * posts. The royal wording follows the standard forms of the Royal Palace; every preview asks the approver to check it.
 * Royal imagery: only the official portraits the founder provides and the Coat of Arms (public/images/holidays/README.txt);
 * never a web photo. The wording and the layout follow docs/BRAND_DESIGN_SYSTEM.md, chapter 2.
 */
import { culturalDaysOf, type CulturalKey } from "@/lib/cultural-calendar"
import { khmerDigits } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { festivalStart } from "@/lib/holidays"
import { toHijri } from "@/lib/islamic"
import * as G from "@/lib/islamic/glossary"

/**
 * The four groups (founder, 20/10/2026 — «not only national holidays»): A national and royal, B Islamic (to
 * @LuyChlatIslamic only), C Chinese traditional, D global and cultural. Every one publishes at 05:00 once approved.
 */
export type NationalKind = "royal" | "memorial" | "national" | "international" | "tradition" | "merit" | "islamic" | "chinese"

export type NationalDay = {
  key: string
  /**
   * «MM-DD» every year; a key of lib/holidays.ts (the official sub-decree dates); a Hijri month and day (with the
   * admin's Hijri offset — moon sighting may move it, the preview says so); a Khmer-Chinese day of lib/cultural-calendar
   * (shifted by `shift` days); or a per-year table (a solar term such as Qingming).
   */
  date: { fixed: string } | { festival: MessageKey } | { hijri: [month: number, day: number] } | { cultural: CulturalKey; shift?: number } | { table: Record<number, string> }
  kind: NationalKind
  /** The poster's pill. */
  pill: string
  title: string
  /** The royal name or the occasion, under the title. */
  subtitle?: string
  /** The year it began — for «ខួបលើកទី N» with the dates. */
  since?: number
  /** The blessing or the words of remembrance. */
  message: string
  /** The short blessing drawn on the poster (one line per line break); the caption keeps the full `message`. */
  posterMessage?: string
  /** The official images it shows when their files are in public/images/holidays (README.txt) — never drawn without. */
  assets?: { portrait?: RoyalPortrait; crest?: boolean; monument?: boolean; backdrop?: boolean }
}

export type RoyalPortrait = "king_sihamoni" | "king_father_sihanouk" | "queen_mother"

/** Royal words a poster must never break across lines (lib/server/poster-kit.ts keeps them whole). */
export const ROYAL_UNBREAKABLE = ["«អេប លុយឆ្លាត»", "សុខភាពល្អ", "ក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ", "សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង", "ព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា។", "ព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍", "ព្រះរាជសុខភាព", "ព្រះកាយពលមាំមួន", "ព្រះជន្មាយុយឺនយូរ", "ព្រះសព្ទសាធុការពរជ័យ", "ក្រាបបង្គំ", "ព្រះវស្សា", "តម្កល់លើត្បូង", "មហានក្ខត្តឫក្ស", "ព្រះវិញ្ញាណក្ខន្ធ", "ព្រះគុណូបការៈ", "ព្រះមហាក្សត្រ", "ព្រះករុណា", "ព្រះវររាជបិតាឯករាជ្យ", "ព្រះវររាជមាតាជាតិខ្មែរ"]

// Line breaks at the right places of the royal names (never inside «ព្រះ…»). Palace orthography (founder, 20/10/2026):
// «ព្រះករុណាព្រះបាទ…» without a space, «ព្រះមហាក្សត្រ នៃ…» with one.
const KING = "ព្រះករុណាព្រះបាទសម្តេចព្រះបរមនាថ នរោត្តម សីហមុនី\nព្រះមហាក្សត្រ នៃព្រះរាជាណាចក្រកម្ពុជា"
// The founder's official palace phrasing (20/10/2026 royal-protocol audit); the approver checks every royal line in the preview.
const ROYAL_OPENING = "ទូលព្រះបង្គំយើងខ្ញុំជាថ្នាក់ដឹកនាំ និងបុគ្គលិកទាំងអស់នៃ «អេប លុយឆ្លាត» សូមលំឱនកាយក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ"
const KING_BLESSING = `ក្នុងឱកាសដ៏មហានក្ខត្តឫក្សនេះ ${ROYAL_OPENING} សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង ទ្រង់ប្រកបដោយព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍ ព្រះកាយពលមាំមួន និងព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា។`

export const NATIONAL_DAYS: NationalDay[] = [
  { key: "new-year", date: { fixed: "01-01" }, kind: "international", pill: "ទិវាចូលឆ្នាំសកល", title: "សួស្តីឆ្នាំថ្មីសកល", message: "អេប លុយឆ្លាត សូមជូនពរលោកអ្នក និងក្រុមគ្រួសារ ជួបតែសេចក្តីសុខ សុខភាពល្អ និងសម្រេចគ្រប់គោលដៅហិរញ្ញវត្ថុក្នុងឆ្នាំថ្មីនេះ។" },
  { key: "victory-day", date: { fixed: "01-07" }, kind: "national", pill: "ទិវាជាតិ", title: "ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍", since: 1979, message: "សូមរំលឹកដល់ថ្ងៃដែលប្រជាជនកម្ពុជាបានរួចផុតពីរបបប្រល័យពូជសាសន៍ ហើយបានរស់ឡើងវិញ ដើម្បីកសាងគ្រួសារ និងមាតុភូមិ។" },
  { key: "womens-day", date: { fixed: "03-08" }, kind: "international", pill: "ទិវាអន្តរជាតិ", title: "ទិវានារីអន្តរជាតិ ៨ មីនា", message: "សូមគោរព និងអបអរសាទរដល់ស្ត្រីទាំងអស់ — ម្តាយ បងស្រី ប្អូនស្រី និងស្ត្រីអ្នករកស៊ី ដែលជាសសរទ្រូងនៃគ្រួសារ និងសេដ្ឋកិច្ចជាតិ។" },
  { key: "khmer-new-year", date: { festival: "holiday.khmer_new_year" }, kind: "tradition", pill: "ពិធីបុណ្យប្រពៃណីជាតិ", title: "សួស្តីឆ្នាំថ្មី ប្រពៃណីជាតិខ្មែរ", message: "អេប លុយឆ្លាត សូមជូនពរលោកអ្នក និងក្រុមគ្រួសារ ជួបប្រទះតែសេចក្តីសុខ ភាពរីករាយ និងធ្វើដំណើរទៅស្រុកកំណើតដោយសុវត្ថិភាព។" },
  { key: "labor-day", date: { fixed: "05-01" }, kind: "international", pill: "ទិវាអន្តរជាតិ", title: "ទិវាពលកម្មអន្តរជាតិ ១ ឧសភា", message: "សូមគោរពដល់កម្មករ កម្មការិនី និងអ្នករកស៊ីទាំងអស់ ដែលកំពុងខិតខំប្រឹងប្រែងចិញ្ចឹមគ្រួសារ និងអភិវឌ្ឍជាតិ។" },
  { key: "visak-bochea", date: { festival: "holiday.visak_bochea" }, kind: "merit", pill: "ពិធីបុណ្យសាសនា", title: "ពិធីបុណ្យវិសាខបូជា", message: "សូមអនុមោទនា ក្នុងឱកាសរំលឹកដល់ថ្ងៃប្រសូត ត្រាស់ដឹង និងបរិនិព្វាននៃព្រះសម្មាសម្ពុទ្ធ។ សូមលោកអ្នក និងក្រុមគ្រួសារ ទទួលបានសេចក្តីសុខ និងសន្តិភាពក្នុងចិត្ត។" },
  { key: "royal-ploughing", date: { festival: "holiday.royal_ploughing" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល", message: "សូមបួងសួងឱ្យឆ្នាំនេះ មានភ្លៀងធ្លាក់ត្រូវរដូវ ផលដំណាំបរិបូរណ៍ សម្រាប់កសិករ និងប្រជាជនទូទាំងប្រទេស។" },
  { key: "king-birthday", date: { fixed: "05-14" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម", subtitle: KING, message: KING_BLESSING, assets: { portrait: "king_sihamoni", crest: true } },
  {
    key: "queen-mother-birthday",
    date: { fixed: "06-18" },
    kind: "royal",
    pill: "ព្រះរាជពិធី",
    title: "ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្ម",
    subtitle: "សម្តេចព្រះមហាក្សត្រី នរោត្តម មុនិនាថ សីហនុ\nព្រះវររាជមាតាជាតិខ្មែរ",
    message: `${ROYAL_OPENING} សូមសម្តេចព្រះមហាក្សត្រី ទ្រង់ប្រកបដោយព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍ ព្រះកាយពលមាំមួន និងព្រះជន្មាយុយឺនយូរ។`,
    assets: { portrait: "queen_mother", crest: true },
  },
  { key: "constitution-day", date: { fixed: "09-24" }, kind: "national", pill: "ទិវាជាតិ", title: "ទិវាប្រកាសរដ្ឋធម្មនុញ្ញ", since: 1993, assets: { crest: true, monument: true }, message: "សូមរំលឹកដល់ថ្ងៃប្រកាសរដ្ឋធម្មនុញ្ញនៃព្រះរាជាណាចក្រកម្ពុជា — មូលដ្ឋាននៃសិទ្ធិ សេរីភាព និងនីតិរដ្ឋសម្រាប់ប្រជាជនគ្រប់រូប។" },
  {
    key: "king-father-memorial",
    date: { fixed: "10-15" },
    kind: "memorial",
    pill: "ទិវាជាតិ",
    title: "ទិវាប្រារព្ធពិធីគោរពព្រះវិញ្ញាណក្ខន្ធ",
    subtitle: "ព្រះករុណាព្រះបាទសម្តេចព្រះ នរោត្តម សីហនុ ព្រះមហាវីរក្សត្រ\nព្រះវររាជបិតាឯករាជ្យ បូរណភាពទឹកដី និងឯកភាពជាតិខ្មែរ",
    since: 2012,
    message: "ក្រុមការងារ អេប លុយឆ្លាត សូមក្រាបបង្គំគោរពព្រះវិញ្ញាណក្ខន្ធ និងរំលឹកដល់ព្រះគុណូបការៈដ៏ធំធេងរបស់ព្រះអង្គ ចំពោះជាតិមាតុភូមិ។",
    assets: { portrait: "king_father_sihanouk", crest: true },
  },
  { key: "coronation", date: { fixed: "10-29" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ", subtitle: KING, since: 2004, message: KING_BLESSING, assets: { portrait: "king_sihamoni", crest: true, backdrop: true } },
  { key: "independence", date: { fixed: "11-09" }, kind: "national", pill: "ទិវាជាតិ", title: "ទិវាបុណ្យឯករាជ្យជាតិ", since: 1953, assets: { portrait: "king_father_sihanouk", crest: true, monument: true }, message: "សូមគោរពដល់វីរបុរស និងដូនតាជាតិ ដែលបានពលីកម្លាំងកាយ និងចិត្ត ដើម្បីឯករាជ្យ និងអធិបតេយ្យភាពនៃព្រះរាជាណាចក្រកម្ពុជា។" },
  { key: "water-festival", date: { festival: "holiday.water_festival" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីបុណ្យអុំទូក បណ្តែតប្រទីប អកអំបុក និងសំពះព្រះខែ", message: "អេប លុយឆ្លាត សូមជូនពរលោកអ្នក និងក្រុមគ្រួសារ ធ្វើដំណើរ និងចូលរួមកម្សាន្តដោយសុវត្ថិភាព ព្រមទាំងជួបតែសេចក្តីសុខ។" },
  // Group D (global and cultural): Pchum Ben, the day of Pchum Thom (the day after the holiday's first day).
  { key: "pchum-ben", date: { cultural: "pchum_ben", shift: 1 }, kind: "merit", pill: "ពិធីបុណ្យសាសនា", title: "ពិធីបុណ្យភ្ជុំបិណ្ឌ", message: "សូមអនុមោទនាពិធីបុណ្យភ្ជុំបិណ្ឌ ក្នុងឱកាសឧទ្ទិសកុសលដល់ដូនតា និងញាតិកាដែលបានចែកឋានទៅ។ សូមលោកអ្នក និងក្រុមគ្រួសារ ធ្វើដំណើរទៅស្រុកកំណើតដោយសុវត្ថិភាព និងជួបជុំគ្នាដោយក្តីសុខ។" },

  // Group B (Islamic) — @LuyChlatIslamic only; the dates from the Hijri calendar with the admin's offset (nationalDateNote).
  { key: "islamic-new-year", date: { hijri: [1, 1] }, kind: "islamic", pill: "ពិធីបុណ្យសាសនាឥស្លាម", title: "ឆ្នាំថ្មីហ៊ីចរ៉ោះសករាជ", subtitle: "Islamic New Year", message: `${G.SALAM_ALL} សូមឱ្យឆ្នាំថ្មីហ៊ីចរ៉ោះសករាជនេះ ជាឆ្នាំនៃការកែលម្អខ្លួន ការគោរពប្រតិបត្តិ និងរបររកស៊ីហាឡាល់ដែលមាន${G.BARAKAH} សម្រាប់បងប្អូន និងក្រុមគ្រួសារ។` },
  {
    key: "mawlid",
    date: { hijri: [3, 12] },
    kind: "islamic",
    pill: "ពិធីបុណ្យសាសនាឥស្លាម",
    title: `ថ្ងៃកំណើត${G.PROPHET}`,
    subtitle: "Mawlid an-Nabi",
    message: `ក្នុងឱកាសរំលឹកថ្ងៃកំណើត${G.PROPHET_FULL} សូមបងប្អូនរំលឹកដល់ចរិយាដ៏ល្អ ភាពស្មោះត្រង់ និងភាពយុត្តិធម៌របស់លោក ក្នុងជីវិត និងការរកស៊ីប្រចាំថ្ងៃ។`,
    // The poster font has no ﷺ glyph: the poster names the Prophet plainly; the caption keeps ﷺ.
    posterMessage: `ក្នុងឱកាសរំលឹកថ្ងៃកំណើត${G.PROPHET} សូមបងប្អូនរំលឹកដល់ចរិយាដ៏ល្អ ភាពស្មោះត្រង់ និងភាពយុត្តិធម៌របស់លោក ក្នុងជីវិត និងការរកស៊ីប្រចាំថ្ងៃ។`,
  },
  { key: "eid-al-fitr", date: { hijri: [10, 1] }, kind: "islamic", pill: "ពិធីបុណ្យសាសនាឥស្លាម", title: `ពិធីបុណ្យរ៉ាយ៉ា${G.IFTAR}`, subtitle: "Eid al-Fitr", message: `${G.SALAM_ALL} ក្នុងឱកាសបុណ្យរ៉ាយ៉ា${G.IFTAR} «អេប លុយឆ្លាត» សូមជូនពរបងប្អូនមូស្លីមទាំងអស់ សូមអល់ឡោះទទួលយកការតមបួស និងការគោរពប្រតិបត្តិរបស់យើងទាំងអស់គ្នា ហើយប្រទាន${G.BARAKAH}ដល់គ្រួសារបងប្អូន។` },
  { key: "arafah", date: { hijri: [12, 9] }, kind: "islamic", pill: "ថ្ងៃដ៏មានតម្លៃ", title: "ថ្ងៃអារ៉ាហ្វះ", subtitle: "Day of Arafah", message: `ថ្ងៃអារ៉ាហ្វះ ជាថ្ងៃដ៏មានតម្លៃសម្រាប់ការសុំអភ័យទោស ការឌុអា និង${G.SUNNAH_FAST}សម្រាប់អ្នកដែលមិនបានទៅធ្វើហាជ្ជី។ សូមអល់ឡោះទទួលយកឌុអារបស់យើងទាំងអស់គ្នា។` },
  { key: "eid-al-adha", date: { hijri: [12, 10] }, kind: "islamic", pill: "ពិធីបុណ្យសាសនាឥស្លាម", title: "ពិធីបុណ្យរ៉ាយ៉ាហាជ", subtitle: "Eid al-Adha", message: `${G.SALAM_ALL} ក្នុងឱកាសបុណ្យរ៉ាយ៉ាហាជ «អេប លុយឆ្លាត» សូមជូនពរបងប្អូនមូស្លីមទាំងអស់ សូមអល់ឡោះទទួលយកការគោរពប្រតិបត្តិ និងការលះបង់របស់យើង ហើយប្រទាន${G.BARAKAH}ដល់ក្រុមគ្រួសារ និងអ្នកជិតខាង។` },

  // Group C (Chinese traditional) — computed by lib/cultural-calendar (Qingming, a solar term, from its table).
  { key: "chinese-new-year", date: { cultural: "chinese_new_year" }, kind: "chinese", pill: "ពិធីបុណ្យប្រពៃណីខ្មែរ-ចិន", title: "សួស្តីបុណ្យចូលឆ្នាំចិន", message: "«អេប លុយឆ្លាត» សូមជូនពរបងប្អូនខ្មែរ-ចិន និងក្រុមគ្រួសារ សុខភាពល្អ រកស៊ីមានបានចម្រុងចម្រើន និងជួបតែសេចក្តីសុខសាន្តក្នុងឆ្នាំថ្មីនេះ។" },
  { key: "qingming", date: { table: { 2026: "2026-04-05", 2027: "2027-04-05", 2028: "2028-04-04", 2029: "2029-04-04", 2030: "2030-04-05" } }, kind: "chinese", pill: "ពិធីបុណ្យប្រពៃណីខ្មែរ-ចិន", title: "ពិធីបុណ្យឆេងម៉េង", message: "ថ្ងៃគោរពវិញ្ញាណក្ខន្ធដូនតា — សូមបងប្អូនខ្មែរ-ចិន ធ្វើដំណើរទៅសែនព្រេន និងសម្អាតផ្នូរដូនតាដោយសុវត្ថិភាព ហើយរំលឹកដល់គុណដូនតាជាមួយក្រុមគ្រួសារ។" },
  { key: "hungry-ghost", date: { cultural: "hungry_ghost" }, kind: "chinese", pill: "ពិធីបុណ្យប្រពៃណីខ្មែរ-ចិន", title: "ថ្ងៃសែនក្បាលទឹក", message: "សូមឱ្យការសែនព្រេន និងការធ្វើទានរបស់បងប្អូន នាំមកនូវសេចក្តីសុខ និងសុវត្ថិភាពដល់ក្រុមគ្រួសារ។" },
  { key: "mid-autumn", date: { cultural: "mid_autumn" }, kind: "chinese", pill: "ពិធីបុណ្យប្រពៃណីខ្មែរ-ចិន", title: "ពិធីសែនព្រះខែ", message: "ពេញបូណ៌មី ជួបជុំគ្រួសារ ជាមួយនំព្រះខែ — «អេប លុយឆ្លាត» សូមឱ្យគ្រួសារបងប្អូនពោរពេញដោយសេចក្តីសុខ និងភាពកក់ក្តៅ។" },
]

/** The day in `year` (YYYY-MM-DD), or null when a lunar day has no official date for that year yet. */
export function nationalDayDate(d: NationalDay, year: number, hijriOffset = 0): string | null {
  const date = d.date
  if ("fixed" in date) return `${year}-${date.fixed}`
  if ("festival" in date) return festivalStart(date.festival, year)
  if ("table" in date) return date.table[year] ?? null
  if ("cultural" in date) {
    const start = culturalDaysOf(year).find((c) => c.key === date.cultural)?.start
    return start ? new Date(Date.parse(`${start}T12:00:00Z`) + (date.shift ?? 0) * 86_400_000).toISOString().slice(0, 10) : null
  }
  // A Hijri day: the first Gregorian day of `year` that converts to it (the admin's offset applied).
  const [month, day] = date.hijri
  for (let t = Date.UTC(year, 0, 1, 12); new Date(t).getUTCFullYear() === year; t += 86_400_000) {
    const g = new Date(t)
    const h = toHijri(new Date(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate(), 12), hijriOffset)
    if (h && h.month === month && h.day === day) return g.toISOString().slice(0, 10)
  }
  return null
}

/**
 * STRICT RELIGIOUS SEPARATION — constitutional (founder, 20/10/2026: «Zero tolerance for cross-contamination»).
 * Each holiday has a category and the only channels it may reach:
 *   islamic  — @LuyChlatIslamic only (never the general channel, never the Page)
 *   buddhist — Visak Bochea, Pchum Ben (and the Sil days, lib/server/holy-days): community + Page; NEVER @LuyChlatIslamic
 *   chinese  — Chinese New Year, Qingming, the Hungry Ghost day, Mid-Autumn: community + Page; NEVER @LuyChlatIslamic
 *   civic    — national, royal and international days: community + Page
 * The dispatcher refuses any other route (holidayRouteAllowed); tests/golden/holiday-channels.test.ts fails the build.
 */
export type HolidayCategory = "islamic" | "buddhist" | "chinese" | "civic"
export type HolidayChannel = "islamic" | "community" | "facebook"

export const holidayCategory = (d: NationalDay): HolidayCategory =>
  d.kind === "islamic" ? "islamic" : d.kind === "merit" ? "buddhist" : d.kind === "chinese" ? "chinese" : "civic"

export function allowedChannels(d: NationalDay): readonly HolidayChannel[] {
  return holidayCategory(d) === "islamic" ? ["islamic"] : ["community", "facebook"]
}

/** May this holiday go to this channel? The one check the dispatcher makes before every send. */
export const holidayRouteAllowed = (d: NationalDay, channel: HolidayChannel) => allowedChannels(d).includes(channel)

/** Where a day's poster goes: the Islamic days to @LuyChlatIslamic only; all others to the community channel and the Page. */
export const nationalChannel = (d: NationalDay): "islamic" | "community" => (allowedChannels(d).includes("islamic") ? "islamic" : "community")

/** The approver is told when a date can move (founder's rule: no silent guessing). */
export function nationalDateNote(d: NationalDay): string | null {
  if ("hijri" in d.date) return "ℹ️ ថ្ងៃខែឥស្លាមគណនាតាមប្រតិទិនហ៊ីជរី ហើយអាចប្រែប្រួលតាមការមើលព្រះចន្ទ — សូមផ្ទៀងផ្ទាត់ជាមួយការប្រកាសផ្លូវការរបស់សហគមន៍មូស្លីមកម្ពុជា មុនអនុម័ត។"
  if ("table" in d.date) return "ℹ️ ថ្ងៃនេះតាមតារាងរដូវចិន (solar term) — សូមផ្ទៀងផ្ទាត់មុនអនុម័ត។"
  return null
}

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
export const kmDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return `${khmerDigits(String(d))} ${KM_MONTHS[m - 1]} ${khmerDigits(String(y))}`
}

/** «២៩ តុលា ២០០៤ – ២៩ តុលា ២០២៦ · ខួបលើកទី២២» (an en dash; the number joined to «ទី»), or just the day. */
export function nationalDateLine(d: NationalDay, day: string): string {
  if (!d.since) return kmDate(day)
  const years = Number(day.slice(0, 4)) - d.since
  return `${kmDate(`${d.since}${day.slice(4)}`)} – ${kmDate(day)} · ខួបលើកទី${khmerDigits(String(years))}`
}

/**
 * The preview opens 48 hours before at 08:00 (Cambodia) and stays open until the publication at 05:00 (founder,
 * 20/10/2026 — a national day lives one day: at 05:00 the poster is already at the top of the feed when people wake).
 */
export const PREVIEW_HOURS_BEFORE = 48
export const PUBLISH_MINUTE = 5 * 60
export const PREVIEW_MINUTE = 8 * 60

/** Days whose preview the founder asked for early (20/10/2026: the 22nd Coronation anniversary, to inspect now). */
export const EARLY_PREVIEWS: Record<string, string> = { "coronation:2026-10-29": "2026-10-20" }

/** The national days whose preview window is open on `today` at `minutes` (Cambodia): from D−2 08:00 until D 05:00. */
export function nationalDaysToPreview(today: string, minutes: number, hijriOffset = 0): { day: NationalDay; date: string }[] {
  const year = Number(today.slice(0, 4))
  const out: { day: NationalDay; date: string }[] = []
  for (const d of NATIONAL_DAYS) {
    for (const y of [year, year + 1]) {
      const date = nationalDayDate(d, y, hijriOffset)
      if (!date) continue
      const from = new Date(Date.parse(`${date}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10)
      const early = EARLY_PREVIEWS[`${d.key}:${date}`]
      const opened = (early !== undefined && today >= early) || today > from || (today === from && minutes >= PREVIEW_MINUTE)
      const notPast = today < date || (today === date && minutes < PUBLISH_MINUTE)
      if (opened && notPast) out.push({ day: d, date })
    }
  }
  return out
}

/** The caption (Telegram HTML) — the title, the royal name, the dates, the message. */
export function nationalCaptionHtml(d: NationalDay, day: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const flag = d.kind === "islamic" ? "🌙" : d.kind === "chinese" ? "🏮" : "🇰🇭"
  return [`${flag} <b>${esc(d.title)}</b>`, ...(d.subtitle ? [esc(d.subtitle)] : []), `📅 ${esc(nationalDateLine(d, day))}`, "", esc(d.message), "", "— អេប លុយឆ្លាត"].join("\n")
}

/** The same as plain text (the Page). */
export const nationalCaptionText = (d: NationalDay, day: string) => nationalCaptionHtml(d, day).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export const nationalDayByKey = (key: string) => NATIONAL_DAYS.find((d) => d.key === key) ?? null
