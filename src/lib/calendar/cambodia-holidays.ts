/**
 * Cambodia's national days, royal ceremonies and international days (founder, 20/10/2026 — «LuyChlat was silent on
 * 15 October»): each one becomes a commemoration poster, previewed in «LCA Approval» 48 hours before at 08:00 and
 * published at 07:00 on the day to the community channel and the Page — only with an approver's tap (ZERO UNAPPROVED
 * PUBLIC POSTS). Pure (cambodia-holidays.test.ts).
 *
 * Fixed days by month-day; the lunar days (Khmer New Year, Visak Bochea, the Royal Ploughing, the Water Festival) from
 * lib/holidays.ts — the dates of the official sub-decree for each year. Pchum Ben keeps its own poster and holy-day
 * posts. The royal wording follows the standard forms of the Royal Palace; every preview asks the approver to check it.
 * Royal imagery: only the official portraits the founder provides and the Coat of Arms (public/images/holidays/README.txt);
 * never a web photo. The wording and the layout follow docs/BRAND_DESIGN_SYSTEM.md, chapter 2.
 */
import { khmerDigits } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { festivalStart } from "@/lib/holidays"

export type NationalKind = "royal" | "memorial" | "national" | "international" | "tradition" | "merit"

export type NationalDay = {
  key: string
  /** «MM-DD» every year, or a key of lib/holidays.ts for a lunar day. */
  date: { fixed: string } | { festival: MessageKey }
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
  /** The official images it shows when their files are in public/images/holidays (README.txt) — never drawn without. */
  assets?: { portrait?: RoyalPortrait; crest?: boolean; monument?: boolean }
}

export type RoyalPortrait = "king_sihamoni" | "king_father_sihanouk" | "queen_mother"

/** Royal words a poster must never break across lines (lib/server/poster-kit.ts keeps them whole). */
export const ROYAL_UNBREAKABLE = ["«អេប លុយឆ្លាត»", "ក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ", "សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង", "ព្រះរាជសុខភាព", "ព្រះកាយពលមាំមួន", "ព្រះជន្មាយុយឺនយូរ", "ព្រះសព្ទសាធុការពរជ័យ", "ក្រាបបង្គំ", "ព្រះវស្សា", "តម្កល់លើត្បូង", "មហានក្ខត្តឫក្ស", "ព្រះវិញ្ញាណក្ខន្ធ", "ព្រះគុណូបការៈ", "ព្រះមហាក្សត្រ", "ព្រះករុណា", "ព្រះវររាជបិតាឯករាជ្យ", "ព្រះវររាជមាតាជាតិខ្មែរ"]

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
  { key: "coronation", date: { fixed: "10-29" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ", subtitle: KING, since: 2004, message: KING_BLESSING, assets: { portrait: "king_sihamoni", crest: true } },
  { key: "independence", date: { fixed: "11-09" }, kind: "national", pill: "ទិវាជាតិ", title: "ទិវាបុណ្យឯករាជ្យជាតិ", since: 1953, assets: { portrait: "king_father_sihanouk", crest: true, monument: true }, message: "សូមគោរពដល់វីរបុរស និងដូនតាជាតិ ដែលបានពលីកម្លាំងកាយ និងចិត្ត ដើម្បីឯករាជ្យ និងអធិបតេយ្យភាពនៃព្រះរាជាណាចក្រកម្ពុជា។" },
  { key: "water-festival", date: { festival: "holiday.water_festival" }, kind: "royal", pill: "ព្រះរាជពិធី", title: "ព្រះរាជពិធីបុណ្យអុំទូក បណ្តែតប្រទីប អកអំបុក និងសំពះព្រះខែ", message: "អេប លុយឆ្លាត សូមជូនពរលោកអ្នក និងក្រុមគ្រួសារ ធ្វើដំណើរ និងចូលរួមកម្សាន្តដោយសុវត្ថិភាព ព្រមទាំងជួបតែសេចក្តីសុខ។" },
]

/** The day in `year` (YYYY-MM-DD), or null when a lunar day has no official date for that year yet. */
export function nationalDayDate(d: NationalDay, year: number): string | null {
  return "fixed" in d.date ? `${year}-${d.date.fixed}` : festivalStart(d.date.festival, year)
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

/** The preview opens 48 hours before at 08:00 (Cambodia), and stays open until the 07:00 publication. */
export const PREVIEW_HOURS_BEFORE = 48
export const PUBLISH_MINUTE = 7 * 60
export const PREVIEW_MINUTE = 8 * 60

/** Days whose preview the founder asked for early (20/10/2026: the 22nd Coronation anniversary, to inspect now). */
export const EARLY_PREVIEWS: Record<string, string> = { "coronation:2026-10-29": "2026-10-20" }

/** The national days whose preview window is open on `today` at `minutes` (Cambodia): from D−2 08:00 until D 07:00. */
export function nationalDaysToPreview(today: string, minutes: number): { day: NationalDay; date: string }[] {
  const year = Number(today.slice(0, 4))
  const out: { day: NationalDay; date: string }[] = []
  for (const d of NATIONAL_DAYS) {
    for (const y of [year, year + 1]) {
      const date = nationalDayDate(d, y)
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
  return [`🇰🇭 <b>${esc(d.title)}</b>`, ...(d.subtitle ? [esc(d.subtitle)] : []), `📅 ${esc(nationalDateLine(d, day))}`, "", esc(d.message), "", "— អេប លុយឆ្លាត"].join("\n")
}

/** The same as plain text (the Page). */
export const nationalCaptionText = (d: NationalDay, day: string) => nationalCaptionHtml(d, day).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export const nationalDayByKey = (key: string) => NATIONAL_DAYS.find((d) => d.key === key) ?? null
