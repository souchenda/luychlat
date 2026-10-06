/**
 * Khmer lunar calendar (ចន្ទគតិ), computed with the traditional Chhankitek
 * rules: each lunar year is 354 days, 355 with a leap day (ជេស្ឋ gets 30
 * days), or 384 with a leap month (អាសាឍ is doubled: បឋមាសាឍ, ទុតិយាសាឍ).
 * Which years are leap comes from the Buddhist-era year (aharkun, avoman,
 * bodithey). Months alternate 29 / 30 days from មិគសិរ (29).
 *
 * The count is anchored on a known date (1 កើត មិគសិរ = 21 Nov 2025, which
 * puts Visak Bochea on 1 May 2026) and checked against the official
 * public-holiday dates (Visak Bochea, Royal Ploughing, Pchum Ben, Water
 * Festival) for 2022–2027 in tests. Pure: no app imports.
 */

export const LUNAR_MONTHS_KM = [
  "មិគសិរ", "បុស្ស", "មាឃ", "ផល្គុន", "ចេត្រ", "ពិសាខ", "ជេស្ឋ", "អាសាឍ", "ស្រាពណ៍", "ភទ្របទ", "អស្សុជ", "កត្ដិក", "បឋមាសាឍ", "ទុតិយាសាឍ",
] as const
export const LUNAR_MONTHS_EN = [
  "Migasir", "Boss", "Meak", "Phalkun", "Chet", "Pisak", "Ches", "Asath", "Srap", "Photrobot", "Assoch", "Kadeuk", "Pathamasath", "Tutiyasath",
] as const

const M = { JESTHA: 6, ASATH: 7, SRAP: 8, KADEUK: 11, PATHAMA: 12, TUTIYA: 13 } as const

const aharkun = (be: number) => Math.floor((be * 292207 + 499) / 800) + 4
const kromthupul = (be: number) => 800 - ((be * 292207 + 499) % 800)
const isSolarLeap = (be: number) => kromthupul(be) <= 207
const avoman = (be: number) => (11 * aharkun(be) + 25) % 692
const bodithey = (be: number) => {
  const a = aharkun(be)
  return (Math.floor((11 * a + 25) / 692) + a + 29) % 30
}

/** 0 normal · 1 leap month · 2 leap day · 3 both (resolved by protetinLeap). */
function boditheyLeap(be: number): 0 | 1 | 2 | 3 {
  const av = avoman(be)
  const bo = bodithey(be)
  let monthLeap = bo >= 25 || bo <= 5
  let dayLeap = false
  if (isSolarLeap(be)) dayLeap = av <= 126
  else if (av <= 137) dayLeap = avoman(be + 1) !== 0 // 137/0: 137 must be a normal year
  if (bo === 25 && bodithey(be + 1) === 5) monthLeap = false // 25/5: only 5 is the leap month
  if (bo === 24 && bodithey(be + 1) === 6) monthLeap = true // 24/6: 24 is the leap month
  return monthLeap && dayLeap ? 3 : monthLeap ? 1 : dayLeap ? 2 : 0
}

/** The year's kind: 0 normal, 1 leap month, 2 leap day (a leap day that clashes with a leap month moves to the next year). */
function protetinLeap(be: number): 0 | 1 | 2 {
  const b = boditheyLeap(be)
  if (b === 3) return 1
  if (b === 1 || b === 2) return b
  return boditheyLeap(be - 1) === 3 ? 2 : 0
}

const isLeapMonthYear = (be: number) => protetinLeap(be) === 1
const isLeapDayYear = (be: number) => protetinLeap(be) === 2
const daysInYear = (be: number) => (isLeapMonthYear(be) ? 384 : isLeapDayYear(be) ? 355 : 354)

function daysInMonth(month: number, be: number): number {
  if (month === M.JESTHA && isLeapDayYear(be)) return 30
  if (month === M.PATHAMA || month === M.TUTIYA) return 30
  return month % 2 === 0 ? 29 : 30
}

/** The months of one lunar year, មិគសិរ → កត្ដិក, with the doubled អាសាឍ in a leap-month year. */
function monthsOf(be: number): number[] {
  const out: number[] = []
  for (let m = 0; m <= M.KADEUK; m++) {
    if (m === M.ASATH && isLeapMonthYear(be)) out.push(M.PATHAMA, M.TUTIYA)
    else out.push(m)
  }
  return out
}

/**
 * The anchor: 1 កើត មិគសិរ of the lunar year running from late 2025 to late
 * 2026, whose Visak Bochea (1 May 2026) starts Buddhist era 2570. A lunar year
 * is numbered by the BE year that starts at its Visak.
 */
const ANCHOR_DAY = Date.UTC(2025, 10, 21) / 86_400_000
const ANCHOR_BE = 2570

export type KhmerLunarDate = {
  /** 1–15 within the phase. */
  day: number
  /** កើត (waxing) or រោច (waning). */
  phase: "kert" | "roch"
  /** Index into LUNAR_MONTHS_KM. */
  month: number
  /** Days in this lunar month (29 or 30). */
  monthLength: number
  /** Buddhist era of the lunar year (changes at Visak Bochea). */
  be: number
}

/** The Khmer lunar date of a calendar day ("YYYY-MM-DD"). */
export function khmerLunarDate(iso: string): KhmerLunarDate {
  const [y, mo, d] = iso.split("-").map(Number)
  let offset = Date.UTC(y, mo - 1, d) / 86_400_000 - ANCHOR_DAY
  let be = ANCHOR_BE
  while (offset < 0) {
    be -= 1
    offset += daysInYear(be)
  }
  while (offset >= daysInYear(be)) {
    offset -= daysInYear(be)
    be += 1
  }
  for (const month of monthsOf(be)) {
    const length = daysInMonth(month, be)
    if (offset < length) {
      const dayIndex = offset // 0-based within the month
      const day = dayIndex < 15 ? dayIndex + 1 : dayIndex - 14
      const phase = dayIndex < 15 ? "kert" : "roch"
      // The lunar year is counted by the BE that starts at its Visak Bochea (15 កើត ពិសាខ):
      // from មិគសិរ until then, the era in use is still the previous one.
      const beforeVisak = month < 5 || (month === 5 && phase === "kert" && day < 15)
      return { day, phase, month, monthLength: length, be: beforeVisak ? be - 1 : be }
    }
    offset -= length
  }
  throw new Error("lunar date out of range")
}

/**
 * Buddhist holy day (ថ្ងៃសីល): 8 កើត, 15 កើត, 8 រោច, and the month's last
 * day (14 រោច in a 29-day month, 15 រោច in a 30-day month).
 */
export function isSilDay(l: KhmerLunarDate): boolean {
  if (l.phase === "kert") return l.day === 8 || l.day === 15
  return l.day === 8 || l.day === l.monthLength - 15
}

const KM_DIGITS = "០១២៣៤៥៦៧៨៩"
const kmNum = (n: number) => String(n).replace(/\d/g, (c) => KM_DIGITS[Number(c)])

/** "៨ កើត ខែកត្ដិក" / "8 waxing, Kadeuk". */
export function formatLunar(l: KhmerLunarDate, locale: "km" | "en" | "zh"): string {
  if (locale === "km") return `${kmNum(l.day)} ${l.phase === "kert" ? "កើត" : "រោច"} ខែ${LUNAR_MONTHS_KM[l.month]}`
  const phase = locale === "zh" ? (l.phase === "kert" ? "上弦" : "下弦") : l.phase === "kert" ? "waxing" : "waning"
  return locale === "zh" ? `${LUNAR_MONTHS_EN[l.month]}月 ${phase}${l.day}日` : `${l.day} ${phase}, ${LUNAR_MONTHS_EN[l.month]}`
}

/** 12 animal years from ជូត (Rat); 2020 was ជូត. */
const ANIMALS_KM = ["ជូត", "ឆ្លូវ", "ខាល", "ថោះ", "រោង", "ម្សាញ់", "មមី", "មមែ", "វក", "រកា", "ច", "កុរ"] as const
const ANIMALS_EN = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"] as const
const ANIMALS_ZH = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"] as const
/** Sak (ស័ក) by Chula Sakaraj year mod 10. */
const SAK_KM = ["សំរឹទ្ធិស័ក", "ឯកស័ក", "ទោស័ក", "ត្រីស័ក", "ចត្វាស័ក", "បញ្ចស័ក", "ឆស័ក", "សប្តស័ក", "អដ្ឋស័ក", "នព្វស័ក"] as const
const SAK_EN = ["Samritthisak", "Aekasak", "Tosak", "Treisak", "Chattvasak", "Panchasak", "Chhasak", "Sapdasak", "Atthasak", "Noppasak"] as const
const WEEKDAYS_KM = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"] as const

/**
 * The animal year and sak of a date. Both turn at Khmer New Year, taken as
 * 14 April (the sak strictly turns on Leung Sak, a day or two later — close
 * enough for display). 2024 ឆ្នាំរោង ឆស័ក · 2026 ឆ្នាំមមី អដ្ឋស័ក.
 */
export function khmerYearName(iso: string): { animal: number; sak: number } {
  const [y, m, d] = iso.split("-").map(Number)
  const year = m > 4 || (m === 4 && d >= 14) ? y : y - 1
  return { animal: (((year - 2020) % 12) + 12) % 12, sak: (year - 638) % 10 }
}

/**
 * The full Chhankitek line: "ថ្ងៃអង្គារ ១០ រោច ខែភទ្របទ ឆ្នាំមមី អដ្ឋស័ក ព.ស. ២៥៧០"
 * (English / Chinese spelled out the same way).
 */
export function formatChhankitek(iso: string, locale: "km" | "en" | "zh"): string {
  const l = khmerLunarDate(iso)
  const { animal, sak } = khmerYearName(iso)
  const [y, m, d] = iso.split("-").map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (locale === "km") return `ថ្ងៃ${WEEKDAYS_KM[weekday]} ${formatLunar(l, "km")} ឆ្នាំ${ANIMALS_KM[animal]} ${SAK_KM[sak]} ព.ស. ${kmNum(l.be)}`
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { weekday: "long", timeZone: "UTC" })
  if (locale === "zh") return `${day} ${formatLunar(l, "zh")} ${ANIMALS_ZH[animal]}年 ${SAK_EN[sak]} 佛历 ${l.be}`
  return `${day}, ${formatLunar(l, "en")}, Year of the ${ANIMALS_EN[animal]}, ${SAK_EN[sak]}, BE ${l.be}`
}

/** Festivals that fall on a holy day (month index, phase, day; "last" = the month's last day). */
const FESTIVALS: { key: string; month: number; phase: "kert" | "roch"; day: number | "last" }[] = [
  { key: "meakBochea", month: 2, phase: "kert", day: 15 },
  { key: "visakBochea", month: 5, phase: "kert", day: 15 },
  { key: "pchumBen", month: 9, phase: "roch", day: "last" },
  { key: "chenhVassa", month: 10, phase: "kert", day: 15 },
  { key: "waterFestival", month: 11, phase: "kert", day: 15 },
]

export type HolyDay = {
  iso: string
  lunar: KhmerLunarDate
  /** big: full moon (15 កើត) or the month's last day; small: 8 កើត / 8 រោច. */
  kind: "big" | "small"
  /** A festival on that day, if any (key for i18n: holyDay.festival.<key>). */
  festival: string | null
  daysAway: number
}

/** The next ថ្ងៃសីល from a date (today counts), within ~2 months. */
export function nextHolyDay(fromIso: string): HolyDay | null {
  const [y, m, d] = fromIso.split("-").map(Number)
  const start = Date.UTC(y, m - 1, d)
  for (let i = 0; i < 60; i++) {
    const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
    const l = khmerLunarDate(iso)
    if (!isSilDay(l)) continue
    const last = l.phase === "roch" && l.day === l.monthLength - 15
    const festival = FESTIVALS.find((f) => f.month === l.month && f.phase === l.phase && (f.day === "last" ? last : f.day === l.day))?.key ?? null
    return { iso, lunar: l, kind: l.day === 15 || last ? "big" : "small", festival, daysAway: i }
  }
  return null
}
